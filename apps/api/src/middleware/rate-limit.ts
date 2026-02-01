import { Context, Next } from 'hono';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute
  keyPrefix: 'ratelimit',
};

// In-memory fallback rate limiting when Redis is unavailable
interface InMemoryEntry {
  count: number;
  expiresAt: number;
}

const inMemoryStore = new Map<string, InMemoryEntry>();
let redisHealthy = true;
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 5000; // Check Redis health every 5 seconds

/**
 * Clean up expired entries from in-memory store
 */
function cleanupInMemoryStore(): void {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore.entries()) {
    if (entry.expiresAt <= now) {
      inMemoryStore.delete(key);
    }
  }
}

/**
 * Check if Redis is healthy (with rate limiting on health checks)
 */
async function checkRedisHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return redisHealthy;
  }

  lastHealthCheck = now;
  try {
    await redis.ping();
    if (!redisHealthy) {
      console.log('Redis connection restored for rate limiting');
    }
    redisHealthy = true;
  } catch {
    if (redisHealthy) {
      console.warn('Redis unavailable for rate limiting, using in-memory fallback');
    }
    redisHealthy = false;
  }

  return redisHealthy;
}

/**
 * In-memory rate limiting fallback
 */
function inMemoryRateLimit(
  identifier: string,
  keyPrefix: string,
  windowMs: number,
  max: number
): { count: number; ttl: number; allowed: boolean } {
  const key = `${keyPrefix}:${identifier}`;
  const now = Date.now();

  // Clean up occasionally (every 100 calls to avoid overhead)
  if (Math.random() < 0.01) {
    cleanupInMemoryStore();
  }

  const entry = inMemoryStore.get(key);

  if (!entry || entry.expiresAt <= now) {
    // Create new entry
    inMemoryStore.set(key, {
      count: 1,
      expiresAt: now + windowMs,
    });
    return { count: 1, ttl: Math.ceil(windowMs / 1000), allowed: true };
  }

  // Increment existing entry
  entry.count++;
  const ttl = Math.ceil((entry.expiresAt - now) / 1000);

  return {
    count: entry.count,
    ttl: Math.max(1, ttl),
    allowed: entry.count <= max,
  };
}

/**
 * Rate limiting middleware using Redis with in-memory fallback
 */
export function rateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, max, keyPrefix } = { ...DEFAULT_CONFIG, ...config };
  const windowSeconds = Math.ceil(windowMs / 1000);

  return async (c: Context, next: Next) => {
    // Get identifier (agent ID if authenticated, IP otherwise)
    const agentId = c.get('agentId');
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    const identifier = agentId || ip;

    const key = `${keyPrefix}:${identifier}`;

    // Check Redis health and use fallback if unavailable
    const isRedisHealthy = await checkRedisHealth();

    let count: number;
    let ttl: number;

    if (isRedisHealthy) {
      try {
        // Increment counter
        count = await redis.incr(key);

        // Set expiry on first request
        if (count === 1) {
          await redis.expire(key, windowSeconds);
        }

        // Get TTL
        ttl = await redis.ttl(key);
      } catch {
        // Redis operation failed, fall back to in-memory
        redisHealthy = false;
        const result = inMemoryRateLimit(identifier, keyPrefix, windowMs, max);
        count = result.count;
        ttl = result.ttl;
      }
    } else {
      // Use in-memory fallback
      const result = inMemoryRateLimit(identifier, keyPrefix, windowMs, max);
      count = result.count;
      ttl = result.ttl;
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', Math.max(0, max - count).toString());
    c.header('X-RateLimit-Reset', (Date.now() + ttl * 1000).toString());

    if (count > max) {
      return c.json(
        {
          success: false,
          error: 'Too many requests',
          retryAfter: ttl,
        },
        429
      );
    }

    await next();
  };
}

/**
 * Action-specific rate limiter (stricter limits)
 */
export function actionRateLimiter() {
  return rateLimiter({
    windowMs: 60000,
    max: 10, // 10 actions per minute
    keyPrefix: 'ratelimit:actions',
  });
}
