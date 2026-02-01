import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { auth } from './auth';
import {
  generateApiKey,
  hashApiKey,
  createSessionToken,
} from '@wallstreetsim/utils';

// Mock environment
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-at-least-32-characters-long');

// Mock database - don't reference external variables in factory
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  agents: {
    apiKeyHash: 'api_key_hash',
    id: 'id',
    name: 'name',
    $inferSelect: {},
  },
}));

import { db } from '@wallstreetsim/db';

// Mock agent data - defined after mocks
const createMockAgent = (overrides = {}) => ({
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
  ...overrides,
});

describe('Auth Routes', () => {
  let app: Hono;
  let testApiKey: string;
  let testApiKeyHash: string;
  let mockAgent: ReturnType<typeof createMockAgent>;

  beforeEach(() => {
    vi.clearAllMocks();

    testApiKey = generateApiKey();
    testApiKeyHash = hashApiKey(testApiKey);
    mockAgent = createMockAgent({ apiKeyHash: testApiKeyHash });

    app = new Hono();
    app.route('/auth', auth);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /auth/register', () => {
    it('should register a new agent with valid data', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const newAgent = { ...mockAgent, id: 'new-agent-id', name: 'NewAgent' };
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newAgent]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'NewAgent',
          role: 'retail_trader',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.agentId).toBeDefined();
      expect(body.data.apiKey).toMatch(/^wss_[A-Za-z0-9_-]+$/);
    });

    it('should reject registration with duplicate name', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'TestAgent',
          role: 'retail_trader',
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('already taken');
    });

    it('should reject registration with invalid data', async () => {
      const res = await app.request('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '', // Invalid: empty name
          role: 'invalid_role',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Validation error');
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify a valid API key', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: testApiKey }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.valid).toBe(true);
      expect(body.data.agentId).toBe(mockAgent.id);
      expect(body.data.name).toBe(mockAgent.name);
    });

    it('should return valid: false for invalid API key', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'wss_invalid_key' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.valid).toBe(false);
    });

    it('should reject request without API key', async () => {
      const res = await app.request('/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('API key required');
    });
  });

  describe('POST /auth/login', () => {
    it('should exchange valid API key for session token', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: testApiKey }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sessionToken).toBeDefined();
      expect(body.data.sessionToken.split('.').length).toBe(3); // JWT format
      expect(body.data.expiresIn).toBe(86400);
      expect(body.data.agent.id).toBe(mockAgent.id);
    });

    it('should reject login with invalid API key', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'wss_invalid_key' }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Invalid API key');
    });

    it('should reject login for inactive agent', async () => {
      const inactiveAgent = { ...mockAgent, status: 'bankrupt' };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([inactiveAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: testApiKey }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('bankrupt');
    });

    it('should reject login without API key', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('API key required');
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh a valid session token', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const originalToken = createSessionToken(
        mockAgent.id,
        mockAgent.name,
        mockAgent.role,
        'test-jwt-secret-at-least-32-characters-long',
        3600
      );

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${originalToken}`,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sessionToken).toBeDefined();
      expect(body.data.sessionToken).not.toBe(originalToken); // Should be new token
      expect(body.data.expiresIn).toBe(86400);
    });

    it('should reject refresh without Authorization header', async () => {
      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Authorization header');
    });

    it('should reject refresh with expired token', async () => {
      const expiredToken = createSessionToken(
        mockAgent.id,
        mockAgent.name,
        mockAgent.role,
        'test-jwt-secret-at-least-32-characters-long',
        -1 // Already expired
      );

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid or expired');
    });

    it('should reject refresh with invalid signature', async () => {
      const invalidToken = createSessionToken(
        mockAgent.id,
        mockAgent.name,
        mockAgent.role,
        'wrong-secret',
        3600
      );

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invalidToken}`,
        },
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Invalid or expired');
    });

    it('should reject refresh for deleted agent', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const token = createSessionToken(
        'deleted-agent-id',
        'DeletedAgent',
        'retail_trader',
        'test-jwt-secret-at-least-32-characters-long',
        3600
      );

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('Agent not found');
    });

    it('should reject refresh for inactive agent', async () => {
      const imprisonedAgent = { ...mockAgent, status: 'imprisoned' };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([imprisonedAgent]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const token = createSessionToken(
        mockAgent.id,
        mockAgent.name,
        mockAgent.role,
        'test-jwt-secret-at-least-32-characters-long',
        3600
      );

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('imprisoned');
    });
  });

  describe('API Key Format', () => {
    it('should generate API keys with correct prefix', () => {
      const apiKey = generateApiKey();
      expect(apiKey).toMatch(/^wss_[A-Za-z0-9_-]+$/);
      expect(apiKey.length).toBeGreaterThan(10);
    });

    it('should hash API keys consistently', () => {
      const apiKey = 'wss_test_key_123';
      const hash1 = hashApiKey(apiKey);
      const hash2 = hashApiKey(apiKey);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('wss_key_1');
      const hash2 = hashApiKey('wss_key_2');
      expect(hash1).not.toBe(hash2);
    });
  });
});
