import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Hoist mock functions
const mockExecute = vi.fn();
const mockPing = vi.fn();

// Mock the database
vi.mock('@wallstreetsim/db', () => ({
  db: {
    execute: () => mockExecute(),
  },
  sql: (strings: TemplateStringsArray) => strings.join(''),
}));

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      ping: () => mockPing(),
    })),
  };
});

// Import after mocks are set up
import { health } from './health';

describe('Health Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/health', health);
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return ok status when all services are healthy', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.checks.database.status).toBe('ok');
      expect(body.checks.database.latencyMs).toBeDefined();
      expect(body.checks.redis.status).toBe('ok');
      expect(body.checks.redis.latencyMs).toBeDefined();
    });

    it('should return unhealthy status when database is down', async () => {
      mockExecute.mockRejectedValue(new Error('Connection refused'));
      mockPing.mockResolvedValue('PONG');

      const res = await app.request('/health');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.error).toBe('Connection refused');
      expect(body.checks.redis.status).toBe('ok');
    });

    it('should return degraded status when only Redis is down', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockRejectedValue(new Error('Redis connection failed'));

      const res = await app.request('/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('degraded');
      expect(body.checks.database.status).toBe('ok');
      expect(body.checks.redis.status).toBe('error');
      expect(body.checks.redis.error).toBe('Redis connection failed');
    });

    it('should return unhealthy status when both services are down', async () => {
      mockExecute.mockRejectedValue(new Error('Database offline'));
      mockPing.mockRejectedValue(new Error('Redis offline'));

      const res = await app.request('/health');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.error).toBe('Database offline');
      expect(body.checks.redis.status).toBe('error');
      expect(body.checks.redis.error).toBe('Redis offline');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockExecute.mockRejectedValue('string error');
      mockPing.mockResolvedValue('PONG');

      const res = await app.request('/health');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.error).toBe('Unknown error');
    });

    it('should include latency measurements for healthy services', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const res = await app.request('/health');
      const body = await res.json();

      expect(typeof body.checks.database.latencyMs).toBe('number');
      expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof body.checks.redis.latencyMs).toBe('number');
      expect(body.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should include uptime in seconds', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const res = await app.request('/health');
      const body = await res.json();

      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include ISO timestamp', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);
      mockPing.mockResolvedValue('PONG');

      const res = await app.request('/health');
      const body = await res.json();

      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status when database is healthy', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);

      const res = await app.request('/health/ready');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ready');
      expect(body.timestamp).toBeDefined();
      expect(body.checks.database.status).toBe('ok');
    });

    it('should return not_ready status when database is down', async () => {
      mockExecute.mockRejectedValue(new Error('Connection refused'));

      const res = await app.request('/health/ready');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('not_ready');
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.error).toBe('Connection refused');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockExecute.mockRejectedValue('string error');

      const res = await app.request('/health/ready');

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe('not_ready');
      expect(body.checks.database.status).toBe('error');
      expect(body.checks.database.error).toBe('Unknown error');
    });

    it('should include ISO timestamp', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);

      const res = await app.request('/health/ready');
      const body = await res.json();

      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
