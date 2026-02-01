/**
 * Retry logic with exponential backoff
 */

/**
 * Configuration options for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry (default: 100) */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries (default: 10000) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Random jitter factor to prevent thundering herd (0-1, default: 0.1) */
  jitterFactor: number;
  /** Optional function to determine if error should trigger retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Optional callback invoked before each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value (only present if success is true) */
  data?: T;
  /** The error that caused final failure (only present if success is false) */
  error?: unknown;
  /** Total number of attempts made */
  attempts: number;
  /** Total time spent in milliseconds */
  totalTimeMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Preset retry profiles for common use cases
 */
export const RETRY_PROFILES = {
  /** Webhook delivery - quick retries with reasonable limits */
  WEBHOOK: {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },
  /** Database operations - fast retries for transient connection issues */
  DATABASE: {
    maxRetries: 2,
    initialDelayMs: 50,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },
  /** Redis operations - very fast retries for in-memory operations */
  REDIS: {
    maxRetries: 2,
    initialDelayMs: 25,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  },
  /** External API calls - slower backoff for rate limiting */
  EXTERNAL_API: {
    maxRetries: 4,
    initialDelayMs: 500,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  },
} as const satisfies Record<string, Partial<RetryConfig>>;

/**
 * Calculate delay for a specific attempt with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Pick<RetryConfig, 'initialDelayMs' | 'maxDelayMs' | 'backoffMultiplier' | 'jitterFactor'>
): number {
  const { initialDelayMs, maxDelayMs, backoffMultiplier, jitterFactor } = config;

  // Calculate exponential delay: initialDelay * multiplier^attempt
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter: delay ± (delay * jitterFactor)
  const jitterRange = cappedDelay * jitterFactor;
  const jitter = (Math.random() * 2 - 1) * jitterRange;

  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable by default
 * Returns true for network errors, timeouts, and server errors
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('network') ||
      message.includes('socket hang up') ||
      message.includes('abort')
    ) {
      return true;
    }

    // Timeout errors (matches "timeout", "timed out", etc.)
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    // Check for HTTP status codes in error
    if ('status' in error || 'statusCode' in error) {
      const status = (error as { status?: number; statusCode?: number }).status ??
        (error as { status?: number; statusCode?: number }).statusCode;
      if (status !== undefined) {
        return isRetryableStatusCode(status);
      }
    }
  }

  return false;
}

/**
 * Check if an HTTP status code is retryable
 */
export function isRetryableStatusCode(status: number): boolean {
  // Retry on rate limiting
  if (status === 429) return true;

  // Retry on server errors (5xx)
  if (status >= 500 && status < 600) return true;

  // Don't retry on client errors (4xx except 429)
  return false;
}

/**
 * Execute an async function with exponential backoff retry logic
 *
 * @param fn - The async function to execute
 * @param config - Partial configuration (merged with defaults)
 * @returns RetryResult containing success status, data/error, and metrics
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com/data'),
 *   { maxRetries: 3, initialDelayMs: 100 }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else {
 *   console.error('Failed after', result.attempts, 'attempts:', result.error);
 * }
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const mergedConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const { maxRetries, shouldRetry, onRetry } = mergedConfig;

  const startTime = Date.now();
  let lastError: unknown;
  let attemptsMade = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attemptsMade = attempt + 1;
    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts: attemptsMade,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt >= maxRetries) {
        break;
      }

      // Check if error is retryable
      const errorIsRetryable = shouldRetry
        ? shouldRetry(error, attempt)
        : isRetryableError(error);

      if (!errorIsRetryable) {
        break;
      }

      // Calculate delay and wait before next attempt
      const delayMs = calculateBackoffDelay(attempt, mergedConfig);

      // Invoke retry callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1, delayMs);
      }

      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attemptsMade,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Execute an async function with retry, throwing on final failure
 *
 * @param fn - The async function to execute
 * @param config - Partial configuration (merged with defaults)
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * try {
 *   const data = await retry(
 *     () => fetchData(),
 *     { maxRetries: 3 }
 *   );
 * } catch (error) {
 *   console.error('All retries failed:', error);
 * }
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const result = await retryWithBackoff(fn, config);

  if (result.success) {
    return result.data as T;
  }

  throw result.error;
}

/**
 * Create a retryable version of an async function
 *
 * @param fn - The async function to wrap
 * @param config - Partial configuration (merged with defaults)
 * @returns A new function that will retry on failure
 *
 * @example
 * ```typescript
 * const fetchWithRetry = withRetry(
 *   (url: string) => fetch(url).then(r => r.json()),
 *   { maxRetries: 3 }
 * );
 *
 * const data = await fetchWithRetry('/api/data');
 * ```
 */
export function withRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<RetryConfig> = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => retry(() => fn(...args), config);
}

/**
 * Create a retryable version of an async function that returns RetryResult
 *
 * @param fn - The async function to wrap
 * @param config - Partial configuration (merged with defaults)
 * @returns A new function that will retry on failure and return RetryResult
 */
export function withRetryResult<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: Partial<RetryConfig> = {}
): (...args: TArgs) => Promise<RetryResult<TResult>> {
  return (...args: TArgs) => retryWithBackoff(() => fn(...args), config);
}
