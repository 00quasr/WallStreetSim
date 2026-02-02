import { Hono } from 'hono';
import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';
import { count } from 'drizzle-orm';
import { db, sql, agents, orders, trades, companies, eq, gte, and } from '@wallstreetsim/db';

// Create a custom registry to avoid conflicts
const register = new Registry();

// Collect default Node.js metrics (memory, CPU, etc.)
collectDefaultMetrics({ register });

// Custom application metrics

// HTTP request metrics
const httpRequestsTotal = new Counter({
  name: 'wallstreetsim_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'wallstreetsim_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// Database metrics
const dbQueryDuration = new Histogram({
  name: 'wallstreetsim_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

const dbConnectionStatus = new Gauge({
  name: 'wallstreetsim_db_connection_status',
  help: 'Database connection status (1 = connected, 0 = disconnected)',
  registers: [register],
});

const redisConnectionStatus = new Gauge({
  name: 'wallstreetsim_redis_connection_status',
  help: 'Redis connection status (1 = connected, 0 = disconnected)',
  registers: [register],
});

// Business metrics
const activeAgentsTotal = new Gauge({
  name: 'wallstreetsim_active_agents_total',
  help: 'Total number of active agents',
  registers: [register],
});

const pendingOrdersTotal = new Gauge({
  name: 'wallstreetsim_pending_orders_total',
  help: 'Total number of pending orders',
  registers: [register],
});

const tradesTotal = new Counter({
  name: 'wallstreetsim_trades_total',
  help: 'Total number of trades executed',
  registers: [register],
});

const tradeVolume = new Gauge({
  name: 'wallstreetsim_trade_volume_total',
  help: 'Total trade volume in USD',
  registers: [register],
});

const activeCompaniesTotal = new Gauge({
  name: 'wallstreetsim_active_companies_total',
  help: 'Total number of active companies',
  registers: [register],
});

// WebSocket metrics
const websocketConnectionsTotal = new Gauge({
  name: 'wallstreetsim_websocket_connections_total',
  help: 'Total number of active WebSocket connections',
  registers: [register],
});

// Process uptime
const processUptimeSeconds = new Gauge({
  name: 'wallstreetsim_process_uptime_seconds',
  help: 'Process uptime in seconds',
  registers: [register],
});

// Export metrics for use in middleware
export {
  httpRequestsTotal,
  httpRequestDuration,
  dbQueryDuration,
  dbConnectionStatus,
  redisConnectionStatus,
  websocketConnectionsTotal,
};

const metrics = new Hono();

/**
 * GET /metrics - Prometheus metrics endpoint
 * Returns metrics in Prometheus text exposition format
 */
metrics.get('/', async (c) => {
  // Update process uptime
  processUptimeSeconds.set(process.uptime());

  // Check database connection
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const duration = (Date.now() - start) / 1000;
    dbQueryDuration.observe({ query_type: 'health_check' }, duration);
    dbConnectionStatus.set(1);
  } catch {
    dbConnectionStatus.set(0);
  }

  // Collect business metrics from database
  try {
    // Count active agents
    const agentCount = await db
      .select({ count: count() })
      .from(agents)
      .where(eq(agents.status, 'active'));
    activeAgentsTotal.set(agentCount[0]?.count ?? 0);

    // Count pending orders
    const orderCount = await db
      .select({ count: count() })
      .from(orders)
      .where(eq(orders.status, 'pending'));
    pendingOrdersTotal.set(orderCount[0]?.count ?? 0);

    // Count active companies (public and actively trading)
    const companyCount = await db
      .select({ count: count() })
      .from(companies)
      .where(and(eq(companies.isPublic, true), eq(companies.tradingStatus, 'active')));
    activeCompaniesTotal.set(companyCount[0]?.count ?? 0);

    // Get recent trade count (last 24 hours) for volume estimation
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentTrades = await db
      .select({ count: count() })
      .from(trades)
      .where(gte(trades.createdAt, oneDayAgo));

    // Note: tradesTotal is a counter, so we track total trades
    // For volume, we'd need to sum prices * quantities
    const tradeCount = recentTrades[0]?.count ?? 0;
    tradeVolume.set(tradeCount); // Placeholder - would need actual volume calculation
  } catch {
    // Silently fail business metrics - database might be down
  }

  // Return metrics in Prometheus format
  const metricsOutput = await register.metrics();

  return c.text(metricsOutput, 200, {
    'Content-Type': register.contentType,
  });
});

export { metrics, register };
