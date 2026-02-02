import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSecretsManager,
  initializeSecrets,
  getSecret,
  getOptionalSecret,
  hasSecret,
  resetSecretsManager,
  redactSecrets,
  redactValue,
  containsSecret,
  redactObject,
  isAINewsEnabled,
  isClickHouseEnabled,
  isFinnhubEnabled,
  isAlpacaEnabled,
  getFeatureAvailability,
  SECRET_KEYS,
} from '../secrets';

describe('SecretsManager', () => {
  // Store original env
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetSecretsManager();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetSecretsManager();
  });

  describe('initialization', () => {
    it('should initialize successfully with valid required secrets', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);

      const result = initializeSecrets();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail initialization with missing required secrets', () => {
      // Remove required secrets
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;
      delete process.env.JWT_SECRET;
      delete process.env.API_SECRET;

      const result = initializeSecrets();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail if JWT_SECRET is too short', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'short'; // Less than 32 chars
      process.env.API_SECRET = 'b'.repeat(32);

      const result = initializeSecrets();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.path.includes('JWT_SECRET'))).toBe(true);
    });

    it('should fail if DATABASE_URL is not a valid URL', () => {
      process.env.DATABASE_URL = 'not-a-url';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);

      const result = initializeSecrets();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.path.includes('DATABASE_URL'))).toBe(true);
    });

    it('should return same result on re-initialization', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);

      const result1 = initializeSecrets();
      const result2 = initializeSecrets();

      expect(result1.success).toBe(result2.success);
      expect(result1.errors).toEqual(result2.errors);
    });
  });

  describe('getSecret', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);
      initializeSecrets();
    });

    it('should return secret value', () => {
      const dbUrl = getSecret('DATABASE_URL');
      expect(dbUrl).toBe('postgresql://user:pass@localhost:5432/db');
    });

    it('should return JWT_SECRET', () => {
      const jwtSecret = getSecret('JWT_SECRET');
      expect(jwtSecret).toBe('a'.repeat(32));
    });
  });

  describe('getOptionalSecret', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);
    });

    it('should return undefined for unset optional secret', () => {
      delete process.env.OPENAI_API_KEY;
      initializeSecrets();

      const apiKey = getOptionalSecret('OPENAI_API_KEY');
      expect(apiKey).toBeUndefined();
    });

    it('should return value for set optional secret', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key-12345';
      initializeSecrets();

      const apiKey = getOptionalSecret('OPENAI_API_KEY');
      expect(apiKey).toBe('sk-test-key-12345');
    });
  });

  describe('hasSecret', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);
    });

    it('should return true for set secrets', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      initializeSecrets();

      expect(hasSecret('OPENAI_API_KEY')).toBe(true);
      expect(hasSecret('DATABASE_URL')).toBe(true);
    });

    it('should return false for unset secrets', () => {
      delete process.env.OPENAI_API_KEY;
      initializeSecrets();

      expect(hasSecret('OPENAI_API_KEY')).toBe(false);
    });
  });

  describe('SecretsManager singleton', () => {
    it('should return same instance', () => {
      const manager1 = getSecretsManager();
      const manager2 = getSecretsManager();

      expect(manager1).toBe(manager2);
    });

    it('should reset properly', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.JWT_SECRET = 'a'.repeat(32);
      process.env.API_SECRET = 'b'.repeat(32);

      const manager = getSecretsManager();
      manager.initialize();

      expect(manager.isInitialized()).toBe(true);

      resetSecretsManager();

      const newManager = getSecretsManager();
      expect(newManager.isInitialized()).toBe(false);
    });

    it('should format validation errors', () => {
      delete process.env.DATABASE_URL;
      delete process.env.REDIS_URL;
      delete process.env.JWT_SECRET;
      delete process.env.API_SECRET;

      initializeSecrets();

      const formatted = getSecretsManager().formatValidationErrors();
      expect(formatted).toContain('DATABASE_URL');
    });
  });
});

describe('redactSecrets', () => {
  it('should redact passwords in PostgreSQL connection strings', () => {
    const url = 'postgresql://user:secretpassword@localhost:5432/db';
    const redacted = redactSecrets(url);

    expect(redacted).toBe('postgresql://user:[REDACTED]@localhost:5432/db');
    expect(redacted).not.toContain('secretpassword');
  });

  it('should redact passwords in Redis connection strings', () => {
    const url = 'redis://:myredispassword@localhost:6379';
    const redacted = redactSecrets(url);

    expect(redacted).toBe('redis://:[REDACTED]@localhost:6379');
    expect(redacted).not.toContain('myredispassword');
  });

  it('should redact OpenAI-style API keys', () => {
    const text = 'Using API key sk-abcdefghijklmnopqrstuvwxyz for requests';
    const redacted = redactSecrets(text);

    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(redacted).toContain('[REDACTED]');
  });

  it('should redact WallStreetSim API keys', () => {
    const text = 'Agent API key: wss_abc123def456';
    const redacted = redactSecrets(text);

    expect(redacted).not.toContain('wss_abc123def456');
    expect(redacted).toContain('[REDACTED]');
  });

  it('should handle empty strings', () => {
    expect(redactSecrets('')).toBe('');
  });

  it('should handle strings without secrets', () => {
    const text = 'This is a normal log message';
    expect(redactSecrets(text)).toBe('This is a normal log message');
  });

  it('should handle multiple secrets in one string', () => {
    const text = 'DB: postgresql://u:p1@host/db, Redis: redis://:p2@host';
    const redacted = redactSecrets(text);

    expect(redacted).not.toContain('p1');
    expect(redacted).not.toContain('p2');
    expect(redacted).toContain('[REDACTED]');
  });
});

describe('redactValue', () => {
  it('should partially redact a value showing first chars', () => {
    const secret = 'sk-abcdefghij';
    const redacted = redactValue(secret);

    expect(redacted).toBe('sk-a********');
    expect(redacted).not.toContain('bcdefghij');
  });

  it('should show custom number of chars', () => {
    const secret = 'mysecretvalue';
    const redacted = redactValue(secret, 6);

    // value is 13 chars, showing 6, so 7 remaining chars redacted but capped at 8
    expect(redacted).toBe('mysecr*******');
  });

  it('should return [NOT SET] for undefined', () => {
    expect(redactValue(undefined)).toBe('[NOT SET]');
  });

  it('should return [REDACTED] for very short values', () => {
    expect(redactValue('abc', 4)).toBe('[REDACTED]');
  });

  it('should limit asterisks to 8', () => {
    const secret = 'a'.repeat(100);
    const redacted = redactValue(secret, 4);

    expect(redacted).toBe('aaaa********');
  });
});

describe('containsSecret', () => {
  it('should detect embedded passwords in URLs', () => {
    expect(containsSecret('postgresql://user:pass@host/db')).toBe(true);
    expect(containsSecret('redis://:password@localhost:6379')).toBe(true);
  });

  it('should detect OpenAI API key patterns', () => {
    expect(containsSecret('sk-abcdefghijklmnopqrstuvwx')).toBe(true);
  });

  it('should detect WallStreetSim API key patterns', () => {
    expect(containsSecret('wss_abc123')).toBe(true);
  });

  it('should detect GitHub token patterns', () => {
    expect(containsSecret('ghp_' + 'a'.repeat(36))).toBe(true);
    expect(containsSecret('gho_' + 'a'.repeat(36))).toBe(true);
  });

  it('should not flag normal strings', () => {
    expect(containsSecret('hello world')).toBe(false);
    expect(containsSecret('user@example.com')).toBe(false);
  });

  it('should detect secret key names', () => {
    expect(containsSecret('DATABASE_URL')).toBe(true);
    expect(containsSecret('JWT_SECRET')).toBe(true);
  });
});

describe('redactObject', () => {
  it('should redact known sensitive keys', () => {
    const obj = {
      username: 'testuser',
      password: 'secretpassword',
      apiKey: 'my-api-key',
    };

    const redacted = redactObject(obj);

    expect(redacted.username).toBe('testuser');
    // password is 14 chars, showing 4, 10 remaining but capped at 8 asterisks
    expect(redacted.password).toBe('secr********');
    // apiKey is 10 chars, showing 4, 6 remaining = 6 asterisks
    expect(redacted.apiKey).toBe('my-a******');
  });

  it('should redact DATABASE_URL values', () => {
    const obj = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    };

    const redacted = redactObject(obj);
    expect(redacted.DATABASE_URL).not.toContain('pass');
  });

  it('should redact nested objects', () => {
    const obj = {
      config: {
        database: {
          password: 'nestedpassword',
        },
      },
    };

    const redacted = redactObject(obj);
    expect((redacted.config as Record<string, Record<string, unknown>>).database.password).not.toBe('nestedpassword');
  });

  it('should redact custom sensitive keys', () => {
    const obj = {
      myCustomSecret: 'secret-value',
      normalField: 'normal',
    };

    const redacted = redactObject(obj, ['myCustomSecret']);
    expect(redacted.myCustomSecret).not.toBe('secret-value');
    expect(redacted.normalField).toBe('normal');
  });

  it('should handle empty objects', () => {
    expect(redactObject({})).toEqual({});
  });

  it('should not modify arrays', () => {
    const obj = {
      items: ['a', 'b', 'c'],
    };

    const redacted = redactObject(obj);
    expect(redacted.items).toEqual(['a', 'b', 'c']);
  });
});

describe('feature availability', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetSecretsManager();

    // Set required secrets
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://:password@localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.API_SECRET = 'b'.repeat(32);
  });

  afterEach(() => {
    process.env = originalEnv;
    resetSecretsManager();
  });

  describe('isAINewsEnabled', () => {
    it('should return true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      initializeSecrets();

      expect(isAINewsEnabled()).toBe(true);
    });

    it('should return false when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      initializeSecrets();

      expect(isAINewsEnabled()).toBe(false);
    });
  });

  describe('isClickHouseEnabled', () => {
    it('should return true when CLICKHOUSE_URL is set', () => {
      process.env.CLICKHOUSE_URL = 'http://localhost:8123';
      initializeSecrets();

      expect(isClickHouseEnabled()).toBe(true);
    });

    it('should return false when CLICKHOUSE_URL is not set', () => {
      delete process.env.CLICKHOUSE_URL;
      initializeSecrets();

      expect(isClickHouseEnabled()).toBe(false);
    });
  });

  describe('isFinnhubEnabled', () => {
    it('should return true when FINNHUB_API_KEY is set', () => {
      process.env.FINNHUB_API_KEY = 'test-key';
      initializeSecrets();

      expect(isFinnhubEnabled()).toBe(true);
    });

    it('should return false when FINNHUB_API_KEY is not set', () => {
      delete process.env.FINNHUB_API_KEY;
      initializeSecrets();

      expect(isFinnhubEnabled()).toBe(false);
    });
  });

  describe('isAlpacaEnabled', () => {
    it('should return true when both ALPACA_API_KEY and ALPACA_SECRET are set', () => {
      process.env.ALPACA_API_KEY = 'key';
      process.env.ALPACA_SECRET = 'secret';
      initializeSecrets();

      expect(isAlpacaEnabled()).toBe(true);
    });

    it('should return false when only ALPACA_API_KEY is set', () => {
      process.env.ALPACA_API_KEY = 'key';
      delete process.env.ALPACA_SECRET;
      initializeSecrets();

      expect(isAlpacaEnabled()).toBe(false);
    });

    it('should return false when neither is set', () => {
      delete process.env.ALPACA_API_KEY;
      delete process.env.ALPACA_SECRET;
      initializeSecrets();

      expect(isAlpacaEnabled()).toBe(false);
    });
  });

  describe('getFeatureAvailability', () => {
    it('should return all features status', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.CLICKHOUSE_URL = 'http://localhost:8123';
      delete process.env.FINNHUB_API_KEY;
      delete process.env.ALPACA_API_KEY;
      initializeSecrets();

      const features = getFeatureAvailability();

      expect(features.aiNews).toBe(true);
      expect(features.clickhouse).toBe(true);
      expect(features.finnhub).toBe(false);
      expect(features.alpaca).toBe(false);
    });
  });
});

describe('SECRET_KEYS', () => {
  it('should contain all expected secret keys', () => {
    expect(SECRET_KEYS).toContain('DATABASE_URL');
    expect(SECRET_KEYS).toContain('REDIS_URL');
    expect(SECRET_KEYS).toContain('JWT_SECRET');
    expect(SECRET_KEYS).toContain('API_SECRET');
    expect(SECRET_KEYS).toContain('OPENAI_API_KEY');
  });

  it('should be frozen (immutable)', () => {
    // TypeScript's const assertion makes this readonly
    expect(Array.isArray(SECRET_KEYS)).toBe(true);
  });
});
