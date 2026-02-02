import { Hono } from 'hono';
import { db, sql } from '@wallstreetsim/db';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const health = new Hono();

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: {
      status: 'ok' | 'error';
      latencyMs?: number;
      error?: string;
    };
    redis: {
      status: 'ok' | 'error';
      latencyMs?: number;
      error?: string;
    };
  };
}

/**
 * GET /health - Comprehensive health check with DB/Redis status
 */
health.get('/', async (c) => {
  const startTime = process.hrtime.bigint();
  const result: HealthCheckResult = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: { status: 'ok' },
      redis: { status: 'ok' },
    },
  };

  // Check PostgreSQL
  try {
    const dbStart = process.hrtime.bigint();
    await db.execute(sql`SELECT 1`);
    const dbEnd = process.hrtime.bigint();
    result.checks.database.latencyMs = Number(dbEnd - dbStart) / 1_000_000;
  } catch (error) {
    result.checks.database.status = 'error';
    result.checks.database.error = error instanceof Error ? error.message : 'Unknown error';
    result.status = 'unhealthy';
  }

  // Check Redis
  try {
    const redisStart = process.hrtime.bigint();
    await redis.ping();
    const redisEnd = process.hrtime.bigint();
    result.checks.redis.latencyMs = Number(redisEnd - redisStart) / 1_000_000;
  } catch (error) {
    result.checks.redis.status = 'error';
    result.checks.redis.error = error instanceof Error ? error.message : 'Unknown error';
    result.status = result.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  // Return appropriate HTTP status
  const httpStatus = result.status === 'ok' ? 200 : result.status === 'degraded' ? 200 : 503;

  return c.json(result, httpStatus);
});

interface ReadinessCheckResult {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: {
      status: 'ok' | 'error';
      error?: string;
    };
  };
}

/**
 * GET /health/ready - Kubernetes readiness probe
 * Returns 200 if the service is ready to accept traffic (DB is accessible)
 * Returns 503 if the service should be removed from load balancer
 */
health.get('/ready', async (c) => {
  const result: ReadinessCheckResult = {
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'ok' },
    },
  };

  // Check PostgreSQL - required for serving traffic
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    result.checks.database.status = 'error';
    result.checks.database.error = error instanceof Error ? error.message : 'Unknown error';
    result.status = 'not_ready';
  }

  const httpStatus = result.status === 'ready' ? 200 : 503;
  return c.json(result, httpStatus);
});

export { health };
