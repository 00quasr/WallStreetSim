import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock fs before importing the openapi module
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({
    openapi: '3.0.3',
    info: {
      title: 'WallStreetSim API',
      description: 'Test description',
      version: '0.1.0',
    },
    paths: {
      '/test': {
        get: {
          summary: 'Test endpoint',
        },
      },
    },
  })),
}));

// Import after mocking
import { openapi } from './openapi';

describe('OpenAPI Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', openapi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /openapi.json', () => {
    it('should return OpenAPI specification', async () => {
      const res = await app.request('/openapi.json');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.3');
      expect(body.info).toBeDefined();
    });

    it('should return content-type application/json', async () => {
      const res = await app.request('/openapi.json');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });

    it('should include API title', async () => {
      const res = await app.request('/openapi.json');
      const body = await res.json();

      expect(body.info.title).toBe('WallStreetSim API');
    });

    it('should include API version', async () => {
      const res = await app.request('/openapi.json');
      const body = await res.json();

      expect(body.info.version).toBe('0.1.0');
    });

    it('should include paths object', async () => {
      const res = await app.request('/openapi.json');
      const body = await res.json();

      expect(body.paths).toBeDefined();
      expect(typeof body.paths).toBe('object');
    });
  });

  describe('GET /openapi', () => {
    it('should return OpenAPI specification (alias)', async () => {
      const res = await app.request('/openapi');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.openapi).toBe('3.0.3');
    });

    it('should return content-type application/json', async () => {
      const res = await app.request('/openapi');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });

    it('should return same content as /openapi.json', async () => {
      const res1 = await app.request('/openapi.json');
      const res2 = await app.request('/openapi');

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(JSON.stringify(body1)).toBe(JSON.stringify(body2));
    });
  });
});

describe('OpenAPI Content Validation', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/', openapi);
  });

  it('should be valid OpenAPI 3.0 format', async () => {
    const res = await app.request('/openapi.json');
    const body = await res.json();

    expect(body.openapi).toMatch(/^3\.0\./);
  });

  it('should include required info fields', async () => {
    const res = await app.request('/openapi.json');
    const body = await res.json();

    expect(body.info.title).toBeDefined();
    expect(body.info.version).toBeDefined();
  });
});
