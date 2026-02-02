import { z } from 'zod';

/**
 * Secrets Management Module
 *
 * Provides centralized, type-safe access to application secrets with:
 * - Validation at initialization
 * - Redaction for safe logging
 * - Clear separation of required vs optional secrets
 * - Singleton pattern to ensure single source of truth
 */

// Schema for required secrets (app will not start without these)
const RequiredSecretsSchema = z.object({
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string'),
  REDIS_URL: z.string().min(1).describe('Redis connection string'),
  JWT_SECRET: z.string().min(32).describe('JWT signing secret (min 32 chars)'),
  API_SECRET: z.string().min(32).describe('API key signing secret (min 32 chars)'),
});

// Helper to transform empty strings to undefined for optional secrets
// Handles both missing keys (undefined) and empty strings
const optionalString = z
  .union([z.string(), z.undefined()])
  .transform((val) => (val === '' || val === undefined ? undefined : val))
  .pipe(z.string().min(1).optional());

const optionalUrl = z
  .union([z.string(), z.undefined()])
  .transform((val) => (val === '' || val === undefined ? undefined : val))
  .pipe(z.string().url().optional());

// Schema for optional secrets (app can run without these, but features may be limited)
const OptionalSecretsSchema = z.object({
  CLICKHOUSE_URL: optionalUrl.describe('ClickHouse connection string'),
  OPENAI_API_KEY: optionalString.describe('OpenAI API key for news generation'),
  FINNHUB_API_KEY: optionalString.describe('Finnhub API key for market data'),
  ALPACA_API_KEY: optionalString.describe('Alpaca API key for trading'),
  ALPACA_SECRET: optionalString.describe('Alpaca API secret'),
});

// Combined schema
const SecretsSchema = RequiredSecretsSchema.merge(OptionalSecretsSchema);

export type RequiredSecrets = z.infer<typeof RequiredSecretsSchema>;
export type OptionalSecrets = z.infer<typeof OptionalSecretsSchema>;
export type Secrets = z.infer<typeof SecretsSchema>;

/**
 * List of secret key names for identification
 */
export const SECRET_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'API_SECRET',
  'CLICKHOUSE_URL',
  'OPENAI_API_KEY',
  'FINNHUB_API_KEY',
  'ALPACA_API_KEY',
  'ALPACA_SECRET',
  'REDIS_PASSWORD',
  'POSTGRES_PASSWORD',
  'CLICKHOUSE_PASSWORD',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

/**
 * Singleton class for managing application secrets
 */
class SecretsManager {
  private secrets: Secrets | null = null;
  private initialized = false;
  private validationErrors: z.ZodIssue[] = [];

  /**
   * Initialize the secrets manager by validating environment variables
   * Should be called once at application startup
   */
  initialize(): { success: boolean; errors: z.ZodIssue[] } {
    if (this.initialized) {
      return { success: this.secrets !== null, errors: this.validationErrors };
    }

    const result = SecretsSchema.safeParse(process.env);

    if (result.success) {
      this.secrets = result.data;
      this.initialized = true;
      this.validationErrors = [];
      return { success: true, errors: [] };
    }

    this.validationErrors = result.error.issues;
    this.initialized = true;
    return { success: false, errors: result.error.issues };
  }

  /**
   * Check if the secrets manager has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if secrets are valid (required secrets present and valid)
   */
  isValid(): boolean {
    return this.secrets !== null;
  }

  /**
   * Get all secrets (must be initialized first)
   * @throws Error if not initialized or validation failed
   */
  getAll(): Secrets {
    this.ensureInitialized();
    if (!this.secrets) {
      throw new Error(
        'Secrets validation failed. Check initialization errors.'
      );
    }
    return this.secrets;
  }

  /**
   * Get a specific secret by key
   * @throws Error if not initialized or secret is not available
   */
  get<K extends keyof Secrets>(key: K): Secrets[K] {
    return this.getAll()[key];
  }

  /**
   * Get a secret or return undefined if not available
   * Does not throw for optional secrets
   */
  getOptional<K extends keyof OptionalSecrets>(key: K): OptionalSecrets[K] {
    if (!this.initialized) {
      this.initialize();
    }
    return this.secrets?.[key];
  }

  /**
   * Check if an optional secret is configured
   */
  hasSecret(key: keyof Secrets): boolean {
    if (!this.initialized) {
      this.initialize();
    }
    const value = this.secrets?.[key];
    return value !== undefined && value !== '';
  }

  /**
   * Get validation errors from initialization
   */
  getValidationErrors(): z.ZodIssue[] {
    return [...this.validationErrors];
  }

  /**
   * Format validation errors for logging
   */
  formatValidationErrors(): string {
    if (this.validationErrors.length === 0) {
      return 'No validation errors';
    }

    return this.validationErrors
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
  }

  /**
   * Reset the manager (useful for testing)
   */
  reset(): void {
    this.secrets = null;
    this.initialized = false;
    this.validationErrors = [];
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }
}

// Singleton instance
let secretsManager: SecretsManager | null = null;

/**
 * Get the secrets manager singleton
 */
export function getSecretsManager(): SecretsManager {
  if (!secretsManager) {
    secretsManager = new SecretsManager();
  }
  return secretsManager;
}

/**
 * Initialize secrets at application startup
 * Call this once before accessing any secrets
 *
 * @example
 * ```typescript
 * const result = initializeSecrets();
 * if (!result.success) {
 *   console.error('Failed to initialize secrets:');
 *   console.error(getSecretsManager().formatValidationErrors());
 *   process.exit(1);
 * }
 * ```
 */
export function initializeSecrets(): { success: boolean; errors: z.ZodIssue[] } {
  return getSecretsManager().initialize();
}

/**
 * Get a secret value by key
 * @throws Error if secrets not initialized or validation failed
 */
export function getSecret<K extends keyof Secrets>(key: K): Secrets[K] {
  return getSecretsManager().get(key);
}

/**
 * Get an optional secret, returns undefined if not configured
 */
export function getOptionalSecret<K extends keyof OptionalSecrets>(
  key: K
): OptionalSecrets[K] {
  return getSecretsManager().getOptional(key);
}

/**
 * Check if a secret is configured
 */
export function hasSecret(key: keyof Secrets): boolean {
  return getSecretsManager().hasSecret(key);
}

/**
 * Reset the secrets manager (for testing)
 */
export function resetSecretsManager(): void {
  if (secretsManager) {
    secretsManager.reset();
  }
  secretsManager = null;
}

// ============================================================================
// Redaction Utilities
// ============================================================================

/**
 * Redact sensitive information from a string
 * Useful for safe logging of connection strings, URLs, etc.
 *
 * @param value - The string to redact
 * @returns The string with sensitive parts replaced with [REDACTED]
 *
 * @example
 * ```typescript
 * const url = 'postgresql://user:secretpass@localhost:5432/db';
 * console.log(redactSecrets(url));
 * // Output: postgresql://user:[REDACTED]@localhost:5432/db
 * ```
 */
export function redactSecrets(value: string): string {
  if (!value) return value;

  let redacted = value;

  // Redact passwords in connection strings (protocol://user:password@host format)
  // This handles: postgresql://user:pass@host, redis://:pass@host, etc.
  redacted = redacted.replace(
    /(:\/\/(?:[^:@/]+)?:)([^@]+)(@)/g,
    '$1[REDACTED]$3'
  );

  // Redact common API key patterns (create new regex instances to reset lastIndex)
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys
    /wss_[a-zA-Z0-9_-]+/g, // WallStreetSim API keys
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal tokens
    /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth tokens
  ];

  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }

  return redacted;
}

/**
 * Redact a specific secret value entirely
 * Shows only the first few characters for identification
 *
 * @param value - The secret value to redact
 * @param showChars - Number of characters to show (default: 4)
 * @returns Partially redacted string like "sk-a***"
 */
export function redactValue(value: string | undefined, showChars: number = 4): string {
  if (!value) return '[NOT SET]';
  if (value.length <= showChars) return '[REDACTED]';
  return `${value.substring(0, showChars)}${'*'.repeat(Math.min(value.length - showChars, 8))}`;
}

/**
 * Check if a string contains what appears to be a secret
 */
export function containsSecret(value: string): boolean {
  // Check for embedded passwords in URLs
  if (/:[^:@/]+@/.test(value)) {
    return true;
  }

  // Check for known secret patterns (use new instances to avoid lastIndex issues)
  const patterns = [
    /sk-[a-zA-Z0-9]{20,}/, // OpenAI-style keys
    /wss_[a-zA-Z0-9_-]+/, // WallStreetSim API keys
    /ghp_[a-zA-Z0-9]{36}/, // GitHub personal tokens
    /gho_[a-zA-Z0-9]{36}/, // GitHub OAuth tokens
  ];

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return true;
    }
  }

  // Check if value matches known secret key names in environment
  const upperValue = value.toUpperCase();
  for (const key of SECRET_KEYS) {
    if (upperValue === key || upperValue.includes(key)) {
      return true;
    }
  }

  return false;
}

/**
 * Create a safe object for logging by redacting sensitive fields
 *
 * @param obj - Object that may contain sensitive fields
 * @param sensitiveKeys - Additional keys to redact
 * @returns New object with sensitive values redacted
 */
export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[] = []
): T {
  const allSensitiveKeys = new Set([
    ...SECRET_KEYS,
    ...sensitiveKeys,
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'authorization',
    'auth',
    'credential',
    'credentials',
  ]);

  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    const lowerKey = key.toLowerCase();

    // Check if key is sensitive
    const isSensitive =
      allSensitiveKeys.has(key) ||
      [...allSensitiveKeys].some(
        (sk) =>
          lowerKey.includes(sk.toLowerCase()) ||
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('token') ||
          lowerKey.includes('key')
      );

    if (isSensitive && typeof value === 'string') {
      (result as Record<string, unknown>)[key] = redactValue(value);
    } else if (typeof value === 'string' && containsSecret(value)) {
      (result as Record<string, unknown>)[key] = redactSecrets(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = redactObject(
        value as Record<string, unknown>,
        sensitiveKeys
      );
    }
  }

  return result;
}

// ============================================================================
// Feature Availability
// ============================================================================

/**
 * Check if AI news generation is available (OpenAI API key configured)
 */
export function isAINewsEnabled(): boolean {
  return hasSecret('OPENAI_API_KEY');
}

/**
 * Check if ClickHouse analytics is available
 */
export function isClickHouseEnabled(): boolean {
  return hasSecret('CLICKHOUSE_URL');
}

/**
 * Check if external market data is available (Finnhub)
 */
export function isFinnhubEnabled(): boolean {
  return hasSecret('FINNHUB_API_KEY');
}

/**
 * Check if Alpaca trading integration is available
 */
export function isAlpacaEnabled(): boolean {
  return hasSecret('ALPACA_API_KEY') && hasSecret('ALPACA_SECRET');
}

/**
 * Get a summary of available features based on configured secrets
 */
export function getFeatureAvailability(): {
  aiNews: boolean;
  clickhouse: boolean;
  finnhub: boolean;
  alpaca: boolean;
} {
  return {
    aiNews: isAINewsEnabled(),
    clickhouse: isClickHouseEnabled(),
    finnhub: isFinnhubEnabled(),
    alpaca: isAlpacaEnabled(),
  };
}

// ============================================================================
// Schema Exports (for use in other validation)
// ============================================================================

export { RequiredSecretsSchema, OptionalSecretsSchema, SecretsSchema };
