import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnvSchema, validateEnv, safeValidateEnv } from './validation';

describe('EnvSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a'.repeat(32),
    API_SECRET: 'b'.repeat(32),
  };

  describe('required fields', () => {
    it('should pass with all required fields', () => {
      const result = EnvSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
    });

    it('should fail when DATABASE_URL is missing', () => {
      const { DATABASE_URL: _, ...env } = validEnv;
      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('DATABASE_URL');
      }
    });

    it('should fail when REDIS_URL is missing', () => {
      const { REDIS_URL: _, ...env } = validEnv;
      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('REDIS_URL');
      }
    });

    it('should fail when JWT_SECRET is missing', () => {
      const { JWT_SECRET: _, ...env } = validEnv;
      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('JWT_SECRET');
      }
    });

    it('should fail when API_SECRET is missing', () => {
      const { API_SECRET: _, ...env } = validEnv;
      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('API_SECRET');
      }
    });
  });

  describe('defaults', () => {
    it('should default NODE_ENV to development', () => {
      const { NODE_ENV: _, ...env } = validEnv;
      const result = EnvSchema.parse(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should default PORT to 3000', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.PORT).toBe(3000);
    });

    it('should default API_PORT to 8080', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.API_PORT).toBe(8080);
    });

    it('should default TICK_INTERVAL_MS to 1000', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.TICK_INTERVAL_MS).toBe(1000);
    });

    it('should default SOCKET_REDIS_ADAPTER to false', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.SOCKET_REDIS_ADAPTER).toBe(false);
    });

    it('should default SOCKET_AUTO_RECOVERY to true', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.SOCKET_AUTO_RECOVERY).toBe(true);
    });
  });

  describe('NODE_ENV validation', () => {
    it('should accept development', () => {
      const result = EnvSchema.parse({ ...validEnv, NODE_ENV: 'development' });
      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept production', () => {
      const result = EnvSchema.parse({ ...validEnv, NODE_ENV: 'production' });
      expect(result.NODE_ENV).toBe('production');
    });

    it('should accept test', () => {
      const result = EnvSchema.parse({ ...validEnv, NODE_ENV: 'test' });
      expect(result.NODE_ENV).toBe('test');
    });

    it('should reject invalid NODE_ENV', () => {
      const result = EnvSchema.safeParse({ ...validEnv, NODE_ENV: 'staging' });
      expect(result.success).toBe(false);
    });
  });

  describe('DATABASE_URL validation', () => {
    it('should accept valid PostgreSQL URL', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/mydb',
      });
      expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/mydb');
    });

    it('should reject invalid URL', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        DATABASE_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('REDIS_URL validation', () => {
    it('should accept valid Redis URL', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        REDIS_URL: 'redis://:password@localhost:6379',
      });
      expect(result.REDIS_URL).toBe('redis://:password@localhost:6379');
    });

    it('should reject empty REDIS_URL', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        REDIS_URL: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('secret length validation', () => {
    it('should reject JWT_SECRET shorter than 32 characters', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        JWT_SECRET: 'short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('JWT_SECRET');
      }
    });

    it('should reject API_SECRET shorter than 32 characters', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        API_SECRET: 'short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('API_SECRET');
      }
    });

    it('should accept secrets exactly 32 characters', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        JWT_SECRET: 'a'.repeat(32),
        API_SECRET: 'b'.repeat(32),
      });
      expect(result.JWT_SECRET.length).toBe(32);
      expect(result.API_SECRET.length).toBe(32);
    });

    it('should accept secrets longer than 32 characters', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        JWT_SECRET: 'a'.repeat(64),
        API_SECRET: 'b'.repeat(64),
      });
      expect(result.JWT_SECRET.length).toBe(64);
      expect(result.API_SECRET.length).toBe(64);
    });
  });

  describe('port validation', () => {
    it('should coerce string ports to numbers', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        PORT: '4000',
        API_PORT: '9000',
      });
      expect(result.PORT).toBe(4000);
      expect(result.API_PORT).toBe(9000);
    });

    it('should reject negative ports', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        PORT: '-1',
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero port', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        PORT: '0',
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer ports', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        PORT: '3000.5',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TICK_INTERVAL_MS validation', () => {
    it('should coerce string to number', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        TICK_INTERVAL_MS: '500',
      });
      expect(result.TICK_INTERVAL_MS).toBe(500);
    });

    it('should reject negative interval', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        TICK_INTERVAL_MS: '-100',
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero interval', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        TICK_INTERVAL_MS: '0',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LOG_LEVEL validation', () => {
    const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

    it.each(validLevels)('should accept valid log level: %s', (level) => {
      const result = EnvSchema.parse({
        ...validEnv,
        LOG_LEVEL: level,
      });
      expect(result.LOG_LEVEL).toBe(level);
    });

    it('should reject invalid log level', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        LOG_LEVEL: 'verbose',
      });
      expect(result.success).toBe(false);
    });

    it('should allow undefined LOG_LEVEL', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.LOG_LEVEL).toBeUndefined();
    });
  });

  describe('boolean string validation', () => {
    it('should parse SOCKET_REDIS_ADAPTER true', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        SOCKET_REDIS_ADAPTER: 'true',
      });
      expect(result.SOCKET_REDIS_ADAPTER).toBe(true);
    });

    it('should parse SOCKET_REDIS_ADAPTER 1', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        SOCKET_REDIS_ADAPTER: '1',
      });
      expect(result.SOCKET_REDIS_ADAPTER).toBe(true);
    });

    it('should parse SOCKET_REDIS_ADAPTER false', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        SOCKET_REDIS_ADAPTER: 'false',
      });
      expect(result.SOCKET_REDIS_ADAPTER).toBe(false);
    });

    it('should parse SOCKET_REDIS_ADAPTER 0', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        SOCKET_REDIS_ADAPTER: '0',
      });
      expect(result.SOCKET_REDIS_ADAPTER).toBe(false);
    });

    it('should parse SOCKET_AUTO_RECOVERY false', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        SOCKET_AUTO_RECOVERY: 'false',
      });
      expect(result.SOCKET_AUTO_RECOVERY).toBe(false);
    });

    it('should parse LOG_FILE_ENABLED true', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        LOG_FILE_ENABLED: 'true',
      });
      expect(result.LOG_FILE_ENABLED).toBe(true);
    });
  });

  describe('URL validation', () => {
    it('should accept valid API_BASE_URL', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        API_BASE_URL: 'https://api.example.com',
      });
      expect(result.API_BASE_URL).toBe('https://api.example.com');
    });

    it('should accept valid WS_URL', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        WS_URL: 'wss://api.example.com',
      });
      expect(result.WS_URL).toBe('wss://api.example.com');
    });

    it('should reject invalid API_BASE_URL', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        API_BASE_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should allow undefined optional URLs', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.API_BASE_URL).toBeUndefined();
      expect(result.WS_URL).toBeUndefined();
      expect(result.NEXT_PUBLIC_API_URL).toBeUndefined();
      expect(result.NEXT_PUBLIC_WS_URL).toBeUndefined();
    });
  });

  describe('optional API keys', () => {
    it('should allow undefined OPENAI_API_KEY', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.OPENAI_API_KEY).toBeUndefined();
    });

    it('should accept valid OPENAI_API_KEY', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        OPENAI_API_KEY: 'sk-test123',
      });
      expect(result.OPENAI_API_KEY).toBe('sk-test123');
    });

    it('should allow undefined FINNHUB_API_KEY', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.FINNHUB_API_KEY).toBeUndefined();
    });

    it('should allow undefined ALPACA keys', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.ALPACA_API_KEY).toBeUndefined();
      expect(result.ALPACA_SECRET).toBeUndefined();
    });
  });

  describe('CLICKHOUSE_URL validation', () => {
    it('should accept valid ClickHouse URL', () => {
      const result = EnvSchema.parse({
        ...validEnv,
        CLICKHOUSE_URL: 'http://user:pass@localhost:8123',
      });
      expect(result.CLICKHOUSE_URL).toBe('http://user:pass@localhost:8123');
    });

    it('should allow undefined CLICKHOUSE_URL', () => {
      const result = EnvSchema.parse(validEnv);
      expect(result.CLICKHOUSE_URL).toBeUndefined();
    });

    it('should reject invalid CLICKHOUSE_URL', () => {
      const result = EnvSchema.safeParse({
        ...validEnv,
        CLICKHOUSE_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'a'.repeat(32),
      API_SECRET: 'b'.repeat(32),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate process.env and return typed config', () => {
    const env = validateEnv();
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('should throw on invalid environment', () => {
    delete process.env.DATABASE_URL;
    expect(() => validateEnv()).toThrow();
  });
});

describe('safeValidateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'a'.repeat(32),
      API_SECRET: 'b'.repeat(32),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return success with valid environment', () => {
    const result = safeValidateEnv();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    }
  });

  it('should return error with invalid environment', () => {
    delete process.env.DATABASE_URL;
    const result = safeValidateEnv();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
