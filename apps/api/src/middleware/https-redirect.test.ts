import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { httpsRedirect } from './https-redirect';

describe('HTTPS Redirect Middleware', () => {
  let app: Hono;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    app = new Hono();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('when enabled', () => {
    beforeEach(() => {
      app.use('*', httpsRedirect({ enabled: true }));
      app.get('/test', (c) => c.json({ ok: true }));
      app.get('/health', (c) => c.json({ status: 'healthy' }));
      app.get('/health/ready', (c) => c.json({ ready: true }));
    });

    it('should redirect HTTP requests to HTTPS', async () => {
      const res = await app.request('http://example.com/test');

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://example.com/test');
    });

    it('should preserve path and query parameters in redirect', async () => {
      const res = await app.request('http://example.com/api/users?page=1&limit=10');

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://example.com/api/users?page=1&limit=10');
    });

    it('should not redirect requests with X-Forwarded-Proto: https', async () => {
      const res = await app.request('http://example.com/test', {
        headers: { 'x-forwarded-proto': 'https' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it('should not redirect requests with X-Forwarded-Ssl: on', async () => {
      const res = await app.request('http://example.com/test', {
        headers: { 'x-forwarded-ssl': 'on' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it('should not redirect HTTPS requests', async () => {
      const res = await app.request('https://example.com/test');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });

    it('should exclude /health path from redirect', async () => {
      const res = await app.request('http://example.com/health');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: 'healthy' });
    });

    it('should exclude /health/ready path from redirect', async () => {
      const res = await app.request('http://example.com/health/ready');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ready: true });
    });

    it('should use X-Forwarded-Host header when available', async () => {
      const res = await app.request('http://internal-lb/test', {
        headers: { 'x-forwarded-host': 'api.wallstreetsim.com' },
      });

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://api.wallstreetsim.com/test');
    });
  });

  describe('when disabled', () => {
    beforeEach(() => {
      app.use('*', httpsRedirect({ enabled: false }));
      app.get('/test', (c) => c.json({ ok: true }));
    });

    it('should not redirect HTTP requests', async () => {
      const res = await app.request('http://example.com/test');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });
  });

  describe('redirect status codes', () => {
    it('should use 301 by default', async () => {
      app.use('*', httpsRedirect({ enabled: true }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('http://example.com/test');

      expect(res.status).toBe(301);
    });

    it('should use custom status code when provided', async () => {
      app.use('*', httpsRedirect({ enabled: true, redirectStatusCode: 302 }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('http://example.com/test');

      expect(res.status).toBe(302);
    });

    it('should support 307 temporary redirect', async () => {
      app.use('*', httpsRedirect({ enabled: true, redirectStatusCode: 307 }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('http://example.com/test');

      expect(res.status).toBe(307);
    });

    it('should support 308 permanent redirect', async () => {
      app.use('*', httpsRedirect({ enabled: true, redirectStatusCode: 308 }));
      app.get('/test', (c) => c.json({ ok: true }));

      const res = await app.request('http://example.com/test');

      expect(res.status).toBe(308);
    });
  });

  describe('custom exclude paths', () => {
    beforeEach(() => {
      app.use(
        '*',
        httpsRedirect({
          enabled: true,
          excludePaths: ['/health', '/metrics', '/api/internal/ping'],
        })
      );
      app.get('/health', (c) => c.json({ status: 'healthy' }));
      app.get('/metrics', (c) => c.text('# metrics'));
      app.get('/api/internal/ping', (c) => c.text('pong'));
      app.get('/api/public', (c) => c.json({ data: 'public' }));
    });

    it('should exclude custom paths from redirect', async () => {
      const healthRes = await app.request('http://example.com/health');
      expect(healthRes.status).toBe(200);

      const metricsRes = await app.request('http://example.com/metrics');
      expect(metricsRes.status).toBe(200);

      const pingRes = await app.request('http://example.com/api/internal/ping');
      expect(pingRes.status).toBe(200);
    });

    it('should redirect non-excluded paths', async () => {
      const res = await app.request('http://example.com/api/public');

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://example.com/api/public');
    });
  });

  describe('production environment defaults', () => {
    it('should enable redirect in production by default', async () => {
      process.env.NODE_ENV = 'production';

      const prodApp = new Hono();
      prodApp.use('*', httpsRedirect());
      prodApp.get('/test', (c) => c.json({ ok: true }));

      const res = await prodApp.request('http://example.com/test');

      expect(res.status).toBe(301);
    });

    it('should disable redirect in development by default', async () => {
      process.env.NODE_ENV = 'development';

      const devApp = new Hono();
      devApp.use('*', httpsRedirect());
      devApp.get('/test', (c) => c.json({ ok: true }));

      const res = await devApp.request('http://example.com/test');

      expect(res.status).toBe(200);
    });

    it('should disable redirect in test environment by default', async () => {
      process.env.NODE_ENV = 'test';

      const testApp = new Hono();
      testApp.use('*', httpsRedirect());
      testApp.get('/test', (c) => c.json({ ok: true }));

      const res = await testApp.request('http://example.com/test');

      expect(res.status).toBe(200);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      app.use('*', httpsRedirect({ enabled: true }));
      app.get('/test', (c) => c.json({ ok: true }));
    });

    it('should handle requests with port numbers', async () => {
      const res = await app.request('http://example.com:8080/test');

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://example.com:8080/test');
    });

    it('should handle requests with fragments', async () => {
      // Note: fragments are typically not sent to servers, but the URL parser handles them
      const res = await app.request('http://example.com/test#section');

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://example.com/test#section');
    });

    it('should handle requests with encoded characters', async () => {
      const res = await app.request('http://example.com/test?name=John%20Doe');

      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://example.com/test?name=John%20Doe');
    });

    it('should handle X-Forwarded-Proto with mixed case', async () => {
      const res = await app.request('http://example.com/test', {
        headers: { 'X-Forwarded-Proto': 'https' },
      });

      expect(res.status).toBe(200);
    });
  });
});
