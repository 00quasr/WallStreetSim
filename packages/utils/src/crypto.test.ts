import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  generateApiKey,
  generateSignedApiKey,
  verifyApiKey,
  hashApiKey,
  generateUUID,
  generateShortId,
  generateHash,
  createSessionToken,
  verifySessionToken,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from './crypto';

describe('Crypto Utilities', () => {
  describe('generateApiKey', () => {
    it('should generate API key with wss_ prefix', () => {
      const apiKey = generateApiKey();
      expect(apiKey).toMatch(/^wss_[A-Za-z0-9_-]+$/);
    });

    it('should generate unique API keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe('generateSignedApiKey', () => {
    it('should generate signed API key with prefix and signature', () => {
      const apiKey = generateSignedApiKey('agent123', 'secret');
      expect(apiKey).toMatch(/^wss_[A-Za-z0-9_-]+\.[a-f0-9]+$/);
    });
  });

  describe('verifyApiKey', () => {
    it('should verify valid signed API key', () => {
      const secret = 'test-secret';
      const agentId = 'agent-id-123';
      const apiKey = generateSignedApiKey(agentId, secret);
      expect(verifyApiKey(apiKey, agentId, secret)).toBe(true);
    });

    it('should reject API key with wrong secret', () => {
      const apiKey = generateSignedApiKey('agent123', 'correct-secret');
      expect(verifyApiKey(apiKey, 'agent123', 'wrong-secret')).toBe(false);
    });

    it('should reject API key with wrong agent ID', () => {
      const apiKey = generateSignedApiKey('agent123', 'secret');
      expect(verifyApiKey(apiKey, 'different-agent', 'secret')).toBe(false);
    });

    it('should reject malformed API key', () => {
      expect(verifyApiKey('invalid', 'agent', 'secret')).toBe(false);
      expect(verifyApiKey('no.signature.here.wrong', 'agent', 'secret')).toBe(false);
    });
  });

  describe('hashApiKey', () => {
    it('should produce consistent hash', () => {
      const apiKey = 'wss_testkey123';
      const hash1 = hashApiKey(apiKey);
      const hash2 = hashApiKey(apiKey);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('wss_key1');
      const hash2 = hashApiKey('wss_key2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex hash', () => {
      const hash = hashApiKey('wss_testkey');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID v4 format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });
  });

  describe('generateShortId', () => {
    it('should generate short ID without prefix', () => {
      const id = generateShortId();
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate short ID with prefix', () => {
      const id = generateShortId('evt');
      expect(id).toMatch(/^evt_[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateHash', () => {
    it('should produce consistent hash for same values', () => {
      const hash1 = generateHash('a', 1, 'b');
      const hash2 = generateHash('a', 1, 'b');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different values', () => {
      const hash1 = generateHash('a', 1);
      const hash2 = generateHash('a', 2);
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 12-character hash', () => {
      const hash = generateHash('test');
      expect(hash).toHaveLength(12);
    });
  });

  describe('Session Token', () => {
    const secret = 'test-secret-at-least-32-characters';
    const agentId = '550e8400-e29b-41d4-a716-446655440000';
    const name = 'TestAgent';
    const role = 'retail_trader';

    describe('createSessionToken', () => {
      it('should create JWT-format token (3 parts)', () => {
        const token = createSessionToken(agentId, name, role, secret, 3600);
        const parts = token.split('.');
        expect(parts).toHaveLength(3);
      });

      it('should include correct payload data', () => {
        const token = createSessionToken(agentId, name, role, secret, 3600);
        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(
          Buffer.from(payloadB64, 'base64url').toString('utf-8')
        );

        expect(payload.sub).toBe(agentId);
        expect(payload.name).toBe(name);
        expect(payload.role).toBe(role);
        expect(payload.iat).toBeDefined();
        expect(payload.exp).toBeDefined();
        expect(payload.exp).toBeGreaterThan(payload.iat);
      });

      it('should set correct expiration time', () => {
        const expiresIn = 7200; // 2 hours
        const before = Math.floor(Date.now() / 1000);
        const token = createSessionToken(agentId, name, role, secret, expiresIn);
        const after = Math.floor(Date.now() / 1000);

        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(
          Buffer.from(payloadB64, 'base64url').toString('utf-8')
        );

        expect(payload.exp - payload.iat).toBe(expiresIn);
        expect(payload.iat).toBeGreaterThanOrEqual(before);
        expect(payload.iat).toBeLessThanOrEqual(after);
      });

      it('should use default expiration of 24 hours', () => {
        const token = createSessionToken(agentId, name, role, secret);
        const [, payloadB64] = token.split('.');
        const payload = JSON.parse(
          Buffer.from(payloadB64, 'base64url').toString('utf-8')
        );

        expect(payload.exp - payload.iat).toBe(86400);
      });
    });

    describe('verifySessionToken', () => {
      it('should verify valid token', () => {
        const token = createSessionToken(agentId, name, role, secret, 3600);
        const payload = verifySessionToken(token, secret);

        expect(payload).not.toBeNull();
        expect(payload?.sub).toBe(agentId);
        expect(payload?.name).toBe(name);
        expect(payload?.role).toBe(role);
      });

      it('should reject token with wrong secret', () => {
        const token = createSessionToken(agentId, name, role, secret, 3600);
        const payload = verifySessionToken(token, 'wrong-secret');

        expect(payload).toBeNull();
      });

      it('should reject expired token', () => {
        const token = createSessionToken(agentId, name, role, secret, -1);
        const payload = verifySessionToken(token, secret);

        expect(payload).toBeNull();
      });

      it('should reject malformed token (wrong number of parts)', () => {
        expect(verifySessionToken('invalid', secret)).toBeNull();
        expect(verifySessionToken('two.parts', secret)).toBeNull();
        expect(verifySessionToken('four.parts.here.invalid', secret)).toBeNull();
      });

      it('should reject token with tampered payload', () => {
        const token = createSessionToken(agentId, name, role, secret, 3600);
        const [header, , signature] = token.split('.');

        // Tamper with payload
        const tamperedPayload = Buffer.from(
          JSON.stringify({ sub: 'hacker', name: 'Evil', role: 'admin', iat: 0, exp: 9999999999 })
        ).toString('base64url');

        const tamperedToken = `${header}.${tamperedPayload}.${signature}`;
        const payload = verifySessionToken(tamperedToken, secret);

        expect(payload).toBeNull();
      });

      it('should reject token with invalid base64 payload', () => {
        const token = createSessionToken(agentId, name, role, secret, 3600);
        const [header, , signature] = token.split('.');
        const malformedToken = `${header}.!!invalid-base64!!.${signature}`;

        const payload = verifySessionToken(malformedToken, secret);
        expect(payload).toBeNull();
      });
    });
  });

  describe('Webhook Signature', () => {
    const testPayload = JSON.stringify({
      tick: 100,
      timestamp: '2024-01-01T00:00:00.000Z',
      portfolio: { cash: 10000 },
    });

    describe('generateWebhookSecret', () => {
      it('should generate 64-character hex string', () => {
        const secret = generateWebhookSecret();
        expect(secret).toMatch(/^[a-f0-9]{64}$/);
      });

      it('should generate unique secrets', () => {
        const secrets = new Set<string>();
        for (let i = 0; i < 100; i++) {
          secrets.add(generateWebhookSecret());
        }
        expect(secrets.size).toBe(100);
      });
    });

    describe('signWebhookPayload', () => {
      it('should produce signature with sha256= prefix', () => {
        const secret = 'test-webhook-secret';
        const signature = signWebhookPayload(testPayload, secret);
        expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
      });

      it('should produce consistent signature for same payload and secret', () => {
        const secret = 'test-webhook-secret';
        const sig1 = signWebhookPayload(testPayload, secret);
        const sig2 = signWebhookPayload(testPayload, secret);
        expect(sig1).toBe(sig2);
      });

      it('should produce different signatures for different payloads', () => {
        const secret = 'test-webhook-secret';
        const sig1 = signWebhookPayload('{"tick":100}', secret);
        const sig2 = signWebhookPayload('{"tick":101}', secret);
        expect(sig1).not.toBe(sig2);
      });

      it('should produce different signatures for different secrets', () => {
        const sig1 = signWebhookPayload(testPayload, 'secret1');
        const sig2 = signWebhookPayload(testPayload, 'secret2');
        expect(sig1).not.toBe(sig2);
      });
    });

    describe('verifyWebhookSignature', () => {
      it('should verify valid signature', () => {
        const secret = 'test-webhook-secret';
        const signature = signWebhookPayload(testPayload, secret);
        expect(verifyWebhookSignature(testPayload, signature, secret)).toBe(true);
      });

      it('should reject signature with wrong secret', () => {
        const signature = signWebhookPayload(testPayload, 'correct-secret');
        expect(verifyWebhookSignature(testPayload, signature, 'wrong-secret')).toBe(false);
      });

      it('should reject signature for modified payload', () => {
        const secret = 'test-webhook-secret';
        const signature = signWebhookPayload(testPayload, secret);
        const modifiedPayload = testPayload.replace('100', '999');
        expect(verifyWebhookSignature(modifiedPayload, signature, secret)).toBe(false);
      });

      it('should reject signature without sha256= prefix', () => {
        const secret = 'test-webhook-secret';
        const signature = signWebhookPayload(testPayload, secret);
        // Remove the sha256= prefix
        const rawSignature = signature.replace('sha256=', '');
        expect(verifyWebhookSignature(testPayload, rawSignature, secret)).toBe(false);
      });

      it('should reject invalid signature format', () => {
        const secret = 'test-webhook-secret';
        expect(verifyWebhookSignature(testPayload, 'invalid', secret)).toBe(false);
        expect(verifyWebhookSignature(testPayload, 'sha256=', secret)).toBe(false);
        expect(verifyWebhookSignature(testPayload, 'md5=abc123', secret)).toBe(false);
      });

      it('should reject tampered signature', () => {
        const secret = 'test-webhook-secret';
        const signature = signWebhookPayload(testPayload, secret);
        // Change one character in the signature
        const tamperedSig = signature.slice(0, -1) + (signature.slice(-1) === 'a' ? 'b' : 'a');
        expect(verifyWebhookSignature(testPayload, tamperedSig, secret)).toBe(false);
      });
    });
  });
});
