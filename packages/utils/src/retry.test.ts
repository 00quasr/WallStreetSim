import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryWithBackoff,
  retry,
  withRetry,
  withRetryResult,
  calculateBackoffDelay,
  sleep,
  isRetryableError,
  isRetryableStatusCode,
  DEFAULT_RETRY_CONFIG,
  RETRY_PROFILES,
} from './retry';

describe('Retry Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential delay correctly', () => {
      const config = {
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      expect(calculateBackoffDelay(0, config)).toBe(100);
      expect(calculateBackoffDelay(1, config)).toBe(200);
      expect(calculateBackoffDelay(2, config)).toBe(400);
      expect(calculateBackoffDelay(3, config)).toBe(800);
    });

    it('should cap delay at maxDelayMs', () => {
      const config = {
        initialDelayMs: 100,
        maxDelayMs: 500,
        backoffMultiplier: 2,
        jitterFactor: 0,
      };

      expect(calculateBackoffDelay(0, config)).toBe(100);
      expect(calculateBackoffDelay(1, config)).toBe(200);
      expect(calculateBackoffDelay(2, config)).toBe(400);
      expect(calculateBackoffDelay(3, config)).toBe(500); // Capped
      expect(calculateBackoffDelay(10, config)).toBe(500); // Still capped
    });

    it('should add jitter within expected range', () => {
      const config = {
        initialDelayMs: 100,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterFactor: 0.5,
      };

      // Run multiple times to check jitter distribution
      const delays = Array.from({ length: 100 }, () =>
        calculateBackoffDelay(0, config)
      );

      // With 50% jitter on 100ms base, expect range of 50-150ms
      const minDelay = Math.min(...delays);
      const maxDelay = Math.max(...delays);

      expect(minDelay).toBeGreaterThanOrEqual(50);
      expect(maxDelay).toBeLessThanOrEqual(150);
    });

    it('should never return negative delay', () => {
      const config = {
        initialDelayMs: 10,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
        jitterFactor: 1.0,
      };

      // With 100% jitter, verify we never go negative
      const delays = Array.from({ length: 100 }, () =>
        calculateBackoffDelay(0, config)
      );

      expect(delays.every((d) => d >= 0)).toBe(true);
    });
  });

  describe('sleep', () => {
    it('should resolve after specified delay', async () => {
      const callback = vi.fn();

      const promise = sleep(100).then(callback);

      expect(callback).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      await promise;
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('isRetryableError', () => {
    it('should return true for network errors', () => {
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('socket hang up'))).toBe(true);
      expect(isRetryableError(new Error('abort'))).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
      expect(isRetryableError(new Error('Connection timed out'))).toBe(true);
      expect(isRetryableError(new Error('TIMEOUT exceeded'))).toBe(true);
    });

    it('should return true for errors with retryable status codes', () => {
      const error429 = Object.assign(new Error('Rate limited'), { status: 429 });
      const error500 = Object.assign(new Error('Server error'), { status: 500 });
      const error503 = Object.assign(new Error('Service unavailable'), { statusCode: 503 });

      expect(isRetryableError(error429)).toBe(true);
      expect(isRetryableError(error500)).toBe(true);
      expect(isRetryableError(error503)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new Error('Validation failed'))).toBe(false);
      expect(isRetryableError(new Error('Invalid input'))).toBe(false);

      const error400 = Object.assign(new Error('Bad request'), { status: 400 });
      const error401 = Object.assign(new Error('Unauthorized'), { status: 401 });
      const error404 = Object.assign(new Error('Not found'), { status: 404 });

      expect(isRetryableError(error400)).toBe(false);
      expect(isRetryableError(error401)).toBe(false);
      expect(isRetryableError(error404)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isRetryableError('string error')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
      expect(isRetryableError(undefined)).toBe(false);
      expect(isRetryableError(42)).toBe(false);
    });
  });

  describe('isRetryableStatusCode', () => {
    it('should return true for 429 (rate limited)', () => {
      expect(isRetryableStatusCode(429)).toBe(true);
    });

    it('should return true for 5xx server errors', () => {
      expect(isRetryableStatusCode(500)).toBe(true);
      expect(isRetryableStatusCode(502)).toBe(true);
      expect(isRetryableStatusCode(503)).toBe(true);
      expect(isRetryableStatusCode(504)).toBe(true);
      expect(isRetryableStatusCode(599)).toBe(true);
    });

    it('should return false for 2xx success codes', () => {
      expect(isRetryableStatusCode(200)).toBe(false);
      expect(isRetryableStatusCode(201)).toBe(false);
      expect(isRetryableStatusCode(204)).toBe(false);
    });

    it('should return false for 4xx client errors except 429', () => {
      expect(isRetryableStatusCode(400)).toBe(false);
      expect(isRetryableStatusCode(401)).toBe(false);
      expect(isRetryableStatusCode(403)).toBe(false);
      expect(isRetryableStatusCode(404)).toBe(false);
      expect(isRetryableStatusCode(422)).toBe(false);
    });
  });

  describe('retryWithBackoff', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first attempt without retry', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(fn, {
        initialDelayMs: 10,
        maxRetries: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should fail after exhausting all retries', async () => {
      const error = new Error('ECONNREFUSED');
      const fn = vi.fn().mockRejectedValue(error);

      const result = await retryWithBackoff(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.attempts).toBe(3); // 1 initial + 2 retries
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying on non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Validation failed'));

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // No retries for non-retryable error
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use custom shouldRetry function', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Custom retryable'))
        .mockResolvedValue('success');

      const shouldRetry = vi.fn().mockReturnValue(true);

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        shouldRetry,
      });

      expect(result.success).toBe(true);
      expect(shouldRetry).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback before each retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(
        1,
        expect.any(Error),
        1,
        expect.any(Number)
      );
      expect(onRetry).toHaveBeenNthCalledWith(
        2,
        expect.any(Error),
        2,
        expect.any(Number)
      );
    });

    it('should track total time', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should use default config values', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await retryWithBackoff(fn);

      // Just verify it runs with defaults
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should return data on success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn);

      expect(result).toBe('success');
    });

    it('should throw on final failure', async () => {
      const error = new Error('ECONNREFUSED');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(
        retry(fn, { maxRetries: 1, initialDelayMs: 10 })
      ).rejects.toThrow('ECONNREFUSED');
    });

    it('should retry and eventually succeed', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const result = await retry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should create a retryable function', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const retryableFn = withRetry(fn, { maxRetries: 2 });

      const result = await retryableFn();

      expect(result).toBe('success');
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = vi.fn().mockImplementation((a: number, b: string) =>
        Promise.resolve(`${a}-${b}`)
      );
      const retryableFn = withRetry(fn, { maxRetries: 2 });

      const result = await retryableFn(42, 'test');

      expect(result).toBe('42-test');
      expect(fn).toHaveBeenCalledWith(42, 'test');
    });

    it('should retry wrapped function on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');

      const retryableFn = withRetry(fn, { maxRetries: 2, initialDelayMs: 10 });

      const result = await retryableFn();

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withRetryResult', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should create a function that returns RetryResult', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const retryableFn = withRetryResult(fn, { maxRetries: 2 });

      const result = await retryableFn();

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
    });

    it('should pass arguments to wrapped function', async () => {
      const fn = vi.fn().mockImplementation((x: number) => Promise.resolve(x * 2));
      const retryableFn = withRetryResult(fn);

      const result = await retryableFn(21);

      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(100);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(10000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.jitterFactor).toBe(0.1);
    });
  });

  describe('RETRY_PROFILES', () => {
    it('should have WEBHOOK profile', () => {
      expect(RETRY_PROFILES.WEBHOOK).toEqual({
        maxRetries: 3,
        initialDelayMs: 100,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      });
    });

    it('should have DATABASE profile', () => {
      expect(RETRY_PROFILES.DATABASE).toEqual({
        maxRetries: 2,
        initialDelayMs: 50,
        maxDelayMs: 2000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      });
    });

    it('should have REDIS profile', () => {
      expect(RETRY_PROFILES.REDIS).toEqual({
        maxRetries: 2,
        initialDelayMs: 25,
        maxDelayMs: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      });
    });

    it('should have EXTERNAL_API profile', () => {
      expect(RETRY_PROFILES.EXTERNAL_API).toEqual({
        maxRetries: 4,
        initialDelayMs: 500,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.2,
      });
    });
  });
});
