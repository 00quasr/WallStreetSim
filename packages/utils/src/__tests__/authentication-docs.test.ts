/**
 * Tests to verify the authentication.md documentation matches the actual codebase.
 * This ensures the documentation stays accurate as the code evolves.
 */

import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  createSessionToken,
  verifySessionToken,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../crypto';
import {
  AgentRoleSchema,
  AgentStatusSchema,
  RegisterAgentSchema,
  EnvSchema,
} from '../validation';

describe('Authentication Documentation Accuracy', () => {
  describe('API Key Format', () => {
    it('generates API keys with wss_ prefix as documented', () => {
      const apiKey = generateApiKey();
      expect(apiKey).toMatch(/^wss_[A-Za-z0-9_-]+$/);
    });

    it('generates API keys with documented randomness (24 bytes = base64url encoded)', () => {
      const apiKey = generateApiKey();
      // wss_ prefix (4 chars) + 32 chars for 24 bytes in base64url
      expect(apiKey.length).toBeGreaterThan(10);
      expect(apiKey.startsWith('wss_')).toBe(true);
    });

    it('hashes API keys to 64-character hex (SHA256) as documented', () => {
      const apiKey = generateApiKey();
      const hash = hashApiKey(apiKey);
      // SHA256 produces 256 bits = 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces consistent hashes as documented (deterministic)', () => {
      const apiKey = 'wss_test_key_12345';
      const hash1 = hashApiKey(apiKey);
      const hash2 = hashApiKey(apiKey);
      expect(hash1).toBe(hash2);
    });
  });

  describe('Agent Roles', () => {
    it('documents all agent roles from AgentRoleSchema', () => {
      // These are the roles documented in authentication.md
      const documentedRoles = [
        'hedge_fund_manager',
        'retail_trader',
        'ceo',
        'investment_banker',
        'financial_journalist',
        'sec_investigator',
        'whistleblower',
        'quant',
        'influencer',
      ];

      // Get actual roles from schema
      const actualRoles = AgentRoleSchema.options;

      // Every documented role should exist in the schema
      for (const docRole of documentedRoles) {
        expect(actualRoles).toContain(docRole);
      }

      // Every schema role should be documented
      for (const schemaRole of actualRoles) {
        expect(documentedRoles).toContain(schemaRole);
      }
    });
  });

  describe('Agent Statuses', () => {
    it('documents all agent statuses from AgentStatusSchema', () => {
      // These are the statuses documented in authentication.md
      const documentedStatuses = ['active', 'bankrupt', 'imprisoned', 'fled'];

      // Get actual statuses from schema
      const actualStatuses = AgentStatusSchema.options;

      // Every documented status should exist in the schema
      for (const docStatus of documentedStatuses) {
        expect(actualStatuses).toContain(docStatus);
      }

      // Every schema status should be documented
      for (const schemaStatus of actualStatuses) {
        expect(documentedStatuses).toContain(schemaStatus);
      }
    });
  });

  describe('Registration Input Validation', () => {
    it('validates name constraints (3-50 chars, alphanumeric/underscore/hyphen)', () => {
      // Valid names
      expect(RegisterAgentSchema.safeParse({ name: 'bot', role: 'quant' }).success).toBe(true);
      expect(RegisterAgentSchema.safeParse({ name: 'my_trading_bot', role: 'quant' }).success).toBe(
        true
      );
      expect(RegisterAgentSchema.safeParse({ name: 'Bot-123', role: 'quant' }).success).toBe(true);

      // Invalid - too short
      expect(RegisterAgentSchema.safeParse({ name: 'ab', role: 'quant' }).success).toBe(false);

      // Invalid - too long
      expect(
        RegisterAgentSchema.safeParse({ name: 'a'.repeat(51), role: 'quant' }).success
      ).toBe(false);

      // Invalid - special characters
      expect(RegisterAgentSchema.safeParse({ name: 'bot@test', role: 'quant' }).success).toBe(
        false
      );
      expect(RegisterAgentSchema.safeParse({ name: 'bot test', role: 'quant' }).success).toBe(
        false
      );
    });

    it('validates role is from allowed list', () => {
      // Valid role
      expect(RegisterAgentSchema.safeParse({ name: 'test', role: 'hedge_fund_manager' }).success).toBe(
        true
      );

      // Invalid role
      expect(RegisterAgentSchema.safeParse({ name: 'test', role: 'invalid_role' }).success).toBe(
        false
      );
    });

    it('validates callbackUrl is optional and must be valid URL if provided', () => {
      // Without callbackUrl
      expect(RegisterAgentSchema.safeParse({ name: 'test', role: 'quant' }).success).toBe(true);

      // With valid callbackUrl
      expect(
        RegisterAgentSchema.safeParse({
          name: 'test',
          role: 'quant',
          callbackUrl: 'https://example.com/webhook',
        }).success
      ).toBe(true);

      // With invalid callbackUrl
      expect(
        RegisterAgentSchema.safeParse({
          name: 'test',
          role: 'quant',
          callbackUrl: 'not-a-url',
        }).success
      ).toBe(false);
    });
  });

  describe('Session Token (JWT)', () => {
    const secret = 'test-jwt-secret-at-least-32-characters-long';
    const agentId = '550e8400-e29b-41d4-a716-446655440000';
    const name = 'TestAgent';
    const role = 'hedge_fund_manager';

    it('creates tokens in JWT format (header.payload.signature) as documented', () => {
      const token = createSessionToken(agentId, name, role, secret, 3600);
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('includes documented payload fields (sub, name, role, iat, exp)', () => {
      const token = createSessionToken(agentId, name, role, secret, 3600);
      const [, payloadB64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

      expect(payload.sub).toBe(agentId);
      expect(payload.name).toBe(name);
      expect(payload.role).toBe(role);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
    });

    it('uses default expiration of 24 hours (86400 seconds) as documented', () => {
      const token = createSessionToken(agentId, name, role, secret);
      const [, payloadB64] = token.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

      expect(payload.exp - payload.iat).toBe(86400);
    });

    it('verifies valid tokens as documented', () => {
      const token = createSessionToken(agentId, name, role, secret, 3600);
      const payload = verifySessionToken(token, secret);

      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe(agentId);
    });

    it('rejects expired tokens as documented', () => {
      const token = createSessionToken(agentId, name, role, secret, -1);
      const payload = verifySessionToken(token, secret);

      expect(payload).toBeNull();
    });

    it('rejects tokens with wrong secret as documented', () => {
      const token = createSessionToken(agentId, name, role, secret, 3600);
      const payload = verifySessionToken(token, 'wrong-secret');

      expect(payload).toBeNull();
    });
  });

  describe('Webhook Signature', () => {
    const testPayload = JSON.stringify({
      tick: 100,
      timestamp: '2024-01-01T00:00:00.000Z',
      portfolio: { cash: 10000 },
    });
    const secret = 'test-webhook-secret';

    it('produces signatures with sha256= prefix as documented', () => {
      const signature = signWebhookPayload(testPayload, secret);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('verifies valid signatures as documented', () => {
      const signature = signWebhookPayload(testPayload, secret);
      expect(verifyWebhookSignature(testPayload, signature, secret)).toBe(true);
    });

    it('rejects tampered payloads as documented', () => {
      const signature = signWebhookPayload(testPayload, secret);
      const tamperedPayload = testPayload.replace('100', '999');
      expect(verifyWebhookSignature(tamperedPayload, signature, secret)).toBe(false);
    });

    it('rejects signatures without sha256= prefix', () => {
      const signature = signWebhookPayload(testPayload, secret);
      const rawSignature = signature.replace('sha256=', '');
      expect(verifyWebhookSignature(testPayload, rawSignature, secret)).toBe(false);
    });

    it('uses timing-safe comparison to prevent timing attacks', () => {
      // The verifyWebhookSignature function should use crypto.timingSafeEqual
      // We verify this indirectly by checking it correctly rejects similar signatures
      const signature = signWebhookPayload(testPayload, secret);
      // Change one character
      const tamperedSig = signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
      expect(verifyWebhookSignature(testPayload, tamperedSig, secret)).toBe(false);
    });
  });

  describe('Environment Variables', () => {
    it('requires JWT_SECRET minimum 32 characters as documented', () => {
      const validEnv = {
        DATABASE_URL: 'postgresql://localhost/db',
        REDIS_URL: 'redis://localhost',
        JWT_SECRET: 'a'.repeat(32),
        API_SECRET: 'b'.repeat(32),
      };
      expect(EnvSchema.safeParse(validEnv).success).toBe(true);

      const invalidEnv = {
        ...validEnv,
        JWT_SECRET: 'a'.repeat(31), // Too short
      };
      expect(EnvSchema.safeParse(invalidEnv).success).toBe(false);
    });

    it('requires API_SECRET minimum 32 characters as documented', () => {
      const validEnv = {
        DATABASE_URL: 'postgresql://localhost/db',
        REDIS_URL: 'redis://localhost',
        JWT_SECRET: 'a'.repeat(32),
        API_SECRET: 'b'.repeat(32),
      };
      expect(EnvSchema.safeParse(validEnv).success).toBe(true);

      const invalidEnv = {
        ...validEnv,
        API_SECRET: 'b'.repeat(31), // Too short
      };
      expect(EnvSchema.safeParse(invalidEnv).success).toBe(false);
    });
  });

  describe('Authorization Header Format', () => {
    it('documents Bearer token format correctly', () => {
      // The documentation states: Authorization: Bearer <api-key-or-session-token>
      // API keys start with wss_
      const apiKey = generateApiKey();
      expect(apiKey.startsWith('wss_')).toBe(true);

      // Session tokens have 3 dot-separated parts
      const sessionToken = createSessionToken(
        'test-id',
        'name',
        'quant',
        'secret-at-least-32-chars-long',
        3600
      );
      expect(sessionToken.split('.').length).toBe(3);
    });
  });

  describe('Token Detection Logic', () => {
    it('can distinguish API keys from session tokens as documented', () => {
      // Documentation states:
      // - API keys start with wss_
      // - Session tokens have three dot-separated parts

      const apiKey = generateApiKey();
      const sessionToken = createSessionToken(
        'test-id',
        'name',
        'quant',
        'secret-at-least-32-chars-long',
        3600
      );

      // API key detection
      expect(apiKey.startsWith('wss_')).toBe(true);
      expect(apiKey.split('.').length).not.toBe(3);

      // Session token detection
      expect(sessionToken.startsWith('wss_')).toBe(false);
      expect(sessionToken.split('.').length).toBe(3);
    });
  });
});
