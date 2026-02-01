import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware } from './auth';
import {
  generateApiKey,
  hashApiKey,
  createSessionToken,
} from '@wallstreetsim/utils';

// Mock environment
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-at-least-32-characters-long');

// Mock agent data
const mockAgent = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'TestAgent',
  role: 'retail_trader',
  apiKeyHash: '',
  callbackUrl: null,
  cash: '100000',
  marginUsed: '0',
  marginLimit: '10000',
  status: 'active',
  reputation: 50,
  createdAt: new Date(),
  lastActiveAt: null,
  metadata: {},
};

// Mock database
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
  agents: {
    apiKeyHash: 'api_key_hash',
    id: 'id',
    $inferSelect: {},
  },
}));

import { db, agents } from '@wallstreetsim/db';

describe('Auth Middleware', () => {
  let app: Hono;
  let testApiKey: string;
  let testApiKeyHash: string;

  beforeEach(() => {
    vi.clearAllMocks();

    testApiKey = generateApiKey();
    testApiKeyHash = hashApiKey(testApiKey);
    mockAgent.apiKeyHash = testApiKeyHash;

    app = new Hono();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authMiddleware', () => {
    beforeEach(() => {
      app.use('/protected/*', authMiddleware);
      app.get('/protected/resource', (c) => {
        return c.json({
          agentId: c.get('agentId'),
          agent: c.get('agent'),
        });
      });
    });

    describe('API Key Authentication', () => {
      it('should reject requests without Authorization header', async () => {
        const res = await app.request('/protected/resource');
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Missing or invalid Authorization header');
      });

      it('should reject requests with invalid Authorization format', async () => {
        const res = await app.request('/protected/resource', {
          headers: { Authorization: 'Basic abc123' },
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Missing or invalid Authorization header');
      });

      it('should reject requests with invalid API key', async () => {
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as unknown as ReturnType<typeof db.select>);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer invalid_api_key` },
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Invalid credentials');
      });

      it('should authenticate with valid API key', async () => {
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockAgent]),
          }),
        } as unknown as ReturnType<typeof db.select>);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${testApiKey}` },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.agentId).toBe(mockAgent.id);
      });

      it('should reject inactive agent with API key', async () => {
        const inactiveAgent = { ...mockAgent, status: 'bankrupt' };
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([inactiveAgent]),
          }),
        } as unknown as ReturnType<typeof db.select>);

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${testApiKey}` },
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('bankrupt');
      });
    });

    describe('Session Token Authentication', () => {
      it('should authenticate with valid session token', async () => {
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockAgent]),
          }),
        } as unknown as ReturnType<typeof db.select>);

        const sessionToken = createSessionToken(
          mockAgent.id,
          mockAgent.name,
          mockAgent.role,
          'test-jwt-secret-at-least-32-characters-long',
          3600
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.agentId).toBe(mockAgent.id);
      });

      it('should reject expired session token', async () => {
        const expiredToken = createSessionToken(
          mockAgent.id,
          mockAgent.name,
          mockAgent.role,
          'test-jwt-secret-at-least-32-characters-long',
          -1 // Already expired
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${expiredToken}` },
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Invalid credentials');
      });

      it('should reject session token with wrong secret', async () => {
        const badToken = createSessionToken(
          mockAgent.id,
          mockAgent.name,
          mockAgent.role,
          'wrong-secret-key',
          3600
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${badToken}` },
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Invalid credentials');
      });

      it('should reject session token for deleted agent', async () => {
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as unknown as ReturnType<typeof db.select>);

        const sessionToken = createSessionToken(
          'deleted-agent-id',
          'DeletedAgent',
          'retail_trader',
          'test-jwt-secret-at-least-32-characters-long',
          3600
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('Invalid credentials');
      });

      it('should reject session token for inactive agent', async () => {
        const imprisonedAgent = { ...mockAgent, status: 'imprisoned' };
        vi.mocked(db.select).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([imprisonedAgent]),
          }),
        } as unknown as ReturnType<typeof db.select>);

        const sessionToken = createSessionToken(
          mockAgent.id,
          mockAgent.name,
          mockAgent.role,
          'test-jwt-secret-at-least-32-characters-long',
          3600
        );

        const res = await app.request('/protected/resource', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.error).toContain('imprisoned');
      });
    });
  });

  describe('optionalAuthMiddleware', () => {
    beforeEach(() => {
      app.use('/public/*', optionalAuthMiddleware);
      app.get('/public/resource', (c) => {
        return c.json({
          agentId: c.get('agentId') || null,
          authenticated: !!c.get('agent'),
        });
      });
    });

    it('should allow requests without Authorization header', async () => {
      const res = await app.request('/public/resource');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBeNull();
      expect(body.authenticated).toBe(false);
    });

    it('should populate agent info with valid API key', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/public/resource', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBe(mockAgent.id);
      expect(body.authenticated).toBe(true);
    });

    it('should populate agent info with valid session token', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const sessionToken = createSessionToken(
        mockAgent.id,
        mockAgent.name,
        mockAgent.role,
        'test-jwt-secret-at-least-32-characters-long',
        3600
      );

      const res = await app.request('/public/resource', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBe(mockAgent.id);
      expect(body.authenticated).toBe(true);
    });

    it('should allow request but not populate agent with invalid API key', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/public/resource', {
        headers: { Authorization: 'Bearer invalid_key' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBeNull();
      expect(body.authenticated).toBe(false);
    });

    it('should allow request but not populate agent with invalid session token', async () => {
      const invalidToken = createSessionToken(
        mockAgent.id,
        mockAgent.name,
        mockAgent.role,
        'wrong-secret',
        3600
      );

      const res = await app.request('/public/resource', {
        headers: { Authorization: `Bearer ${invalidToken}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBeNull();
      expect(body.authenticated).toBe(false);
    });

    it('should not populate agent for inactive agents', async () => {
      const inactiveAgent = { ...mockAgent, status: 'fled' };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([inactiveAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/public/resource', {
        headers: { Authorization: `Bearer ${testApiKey}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.agentId).toBeNull();
      expect(body.authenticated).toBe(false);
    });
  });
});
