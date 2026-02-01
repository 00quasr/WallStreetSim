import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock Redis
const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  ping: vi.fn(),
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedis),
}));

describe('Rate Limiter Middleware', () => {
  let rateLimiter: typeof import('./rate-limit').rateLimiter;
  let actionRateLimiter: typeof import('./rate-limit').actionRateLimiter;
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Reset module state between tests
    vi.useFakeTimers();

    // Re-import module to get fresh state
    const module = await import('./rate-limit');
    rateLimiter = module.rateLimiter;
    actionRateLimiter = module.actionRateLimiter;

    // Default mock: Redis healthy with first request
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(60);
    mockRedis.ping.mockResolvedValue('PONG');

    app = new Hono();
    app.use('/*', rateLimiter());
    app.get('/test', (c) => c.json({ success: true }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('with healthy Redis', () => {
    it('allows requests under the limit', async () => {
      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('99');
    });

    it('increments counter on each request', async () => {
      mockRedis.incr.mockResolvedValue(1);
      await app.request('/test');
      expect(mockRedis.incr).toHaveBeenCalledTimes(1);

      mockRedis.incr.mockResolvedValue(2);
      await app.request('/test');
      expect(mockRedis.incr).toHaveBeenCalledTimes(2);
    });

    it('sets expiry on first request', async () => {
      mockRedis.incr.mockResolvedValue(1);
      await app.request('/test');
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('does not set expiry on subsequent requests', async () => {
      mockRedis.incr.mockResolvedValue(2);
      await app.request('/test');
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('returns 429 when limit exceeded', async () => {
      mockRedis.incr.mockResolvedValue(101);
      mockRedis.ttl.mockResolvedValue(30);

      const res = await app.request('/test');

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toBe('Too many requests');
      expect(body.retryAfter).toBe(30);
    });

    it('uses agent ID when authenticated', async () => {
      app = new Hono();
      app.use('/*', async (c, next) => {
        c.set('agentId', 'agent-123');
        await next();
      });
      app.use('/*', rateLimiter());
      app.get('/test', (c) => c.json({ success: true }));

      await app.request('/test');

      expect(mockRedis.incr).toHaveBeenCalledWith('ratelimit:agent-123');
    });

    it('uses IP address when not authenticated', async () => {
      await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      expect(mockRedis.incr).toHaveBeenCalledWith('ratelimit:192.168.1.1');
    });
  });

  describe('with Redis unavailable', () => {
    beforeEach(() => {
      // Simulate Redis unavailable
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));
      mockRedis.incr.mockRejectedValue(new Error('Connection refused'));
    });

    it('falls back to in-memory rate limiting', async () => {
      // Advance time to trigger health check
      vi.advanceTimersByTime(6000);

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Limit')).toBe('100');
    });

    it('still enforces limits with in-memory fallback', async () => {
      vi.advanceTimersByTime(6000);

      // Make 101 requests
      for (let i = 0; i < 100; i++) {
        const res = await app.request('/test', {
          headers: { 'x-forwarded-for': '192.168.1.1' },
        });
        expect(res.status).toBe(200);
      }

      // 101st request should be rate limited
      const res = await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });
      expect(res.status).toBe(429);
    });

    it('tracks separate limits per IP in fallback mode', async () => {
      vi.advanceTimersByTime(6000);

      // Make requests from two different IPs
      const res1 = await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });
      const res2 = await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.2' },
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Each should have full allowance
      expect(res1.headers.get('X-RateLimit-Remaining')).toBe('99');
      expect(res2.headers.get('X-RateLimit-Remaining')).toBe('99');
    });
  });

  describe('Redis operation failure mid-request', () => {
    it('falls back to in-memory on Redis operation failure', async () => {
      // First request succeeds
      mockRedis.incr.mockResolvedValueOnce(1);
      await app.request('/test');

      // Second request fails Redis operation
      mockRedis.incr.mockRejectedValueOnce(new Error('Redis error'));

      const res = await app.request('/test');

      expect(res.status).toBe(200);
    });
  });

  describe('custom configuration', () => {
    it('respects custom max limit', async () => {
      app = new Hono();
      app.use('/*', rateLimiter({ max: 5 }));
      app.get('/test', (c) => c.json({ success: true }));

      mockRedis.incr.mockResolvedValue(1);
      const res = await app.request('/test');

      expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    });

    it('respects custom window', async () => {
      app = new Hono();
      app.use('/*', rateLimiter({ windowMs: 30000 }));
      app.get('/test', (c) => c.json({ success: true }));

      mockRedis.incr.mockResolvedValue(1);
      await app.request('/test');

      expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 30);
    });

    it('respects custom key prefix', async () => {
      app = new Hono();
      app.use('/*', rateLimiter({ keyPrefix: 'custom' }));
      app.get('/test', (c) => c.json({ success: true }));

      await app.request('/test', {
        headers: { 'x-forwarded-for': '192.168.1.1' },
      });

      expect(mockRedis.incr).toHaveBeenCalledWith('custom:192.168.1.1');
    });
  });
});

describe('Action Rate Limiter', () => {
  let actionRateLimiter: typeof import('./rate-limit').actionRateLimiter;
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const module = await import('./rate-limit');
    actionRateLimiter = module.actionRateLimiter;

    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.ttl.mockResolvedValue(60);
    mockRedis.ping.mockResolvedValue('PONG');

    app = new Hono();
    app.use('/*', actionRateLimiter());
    app.post('/action', (c) => c.json({ success: true }));
  });

  it('has stricter limit of 10 requests per minute', async () => {
    const res = await app.request('/action', { method: 'POST' });

    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });

  it('uses actions key prefix', async () => {
    await app.request('/action', {
      method: 'POST',
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    expect(mockRedis.incr).toHaveBeenCalledWith('ratelimit:actions:192.168.1.1');
  });
});
