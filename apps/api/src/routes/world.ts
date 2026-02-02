import { Hono } from 'hono';
import { db, worldState, agents, companies, investigations } from '@wallstreetsim/db';
import { eq, sql, count, inArray, desc } from 'drizzle-orm';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const world = new Hono();

/**
 * GET /world/status - Get world status
 */
world.get('/status', async (c) => {
  const [state] = await db.select().from(worldState).where(eq(worldState.id, 1));

  if (!state) {
    return c.json(
      {
        success: false,
        error: 'World state not initialized',
      },
      500
    );
  }

  // Get agent counts
  const agentCounts = await db
    .select({
      status: agents.status,
      count: count(),
    })
    .from(agents)
    .groupBy(agents.status);

  const agentStats: Record<string, number> = {};
  for (const row of agentCounts) {
    agentStats[row.status] = Number(row.count);
  }

  // Get market stats
  const [marketStats] = await db
    .select({
      totalMarketCap: sql<string>`SUM(CAST(${companies.marketCap} AS DECIMAL))`,
      companyCount: count(),
    })
    .from(companies)
    .where(eq(companies.isPublic, true));

  return c.json({
    success: true,
    data: {
      tick: state.currentTick,
      marketOpen: state.marketOpen,
      regime: state.regime,
      interestRate: parseFloat(state.interestRate),
      inflationRate: parseFloat(state.inflationRate),
      gdpGrowth: parseFloat(state.gdpGrowth),
      lastTickAt: state.lastTickAt,
      agents: {
        total: Object.values(agentStats).reduce((a, b) => a + b, 0),
        active: agentStats['active'] || 0,
        bankrupt: agentStats['bankrupt'] || 0,
        imprisoned: agentStats['imprisoned'] || 0,
        fled: agentStats['fled'] || 0,
      },
      market: {
        totalMarketCap: parseFloat(marketStats?.totalMarketCap || '0'),
        companyCount: Number(marketStats?.companyCount || 0),
      },
    },
  });
});

/**
 * GET /world/tick - Get current tick info
 */
world.get('/tick', async (c) => {
  // Get from Redis for real-time accuracy
  const redisTick = await redis.get('tick:current');
  const tick = redisTick ? parseInt(redisTick, 10) : 0;

  const [state] = await db.select().from(worldState).where(eq(worldState.id, 1));

  return c.json({
    success: true,
    data: {
      tick,
      marketOpen: state?.marketOpen ?? false,
      lastTickAt: state?.lastTickAt ?? null,
    },
  });
});

/**
 * GET /world/leaderboard - Get agent leaderboard
 */
world.get('/leaderboard', async (c) => {
  const limit = parseInt(c.req.query('limit') || '100', 10);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      status: agents.status,
      cash: agents.cash,
    })
    .from(agents)
    .orderBy(sql`CAST(${agents.cash} AS DECIMAL) DESC`)
    .limit(Math.min(limit, 100));

  const leaderboard = rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    netWorth: parseFloat(row.cash || '0'),
    change24h: 0, // Would be calculated from historical data
  }));

  return c.json({
    success: true,
    data: leaderboard,
  });
});

/**
 * GET /world/investigations/most-wanted - Get active SEC investigations (Most Wanted)
 */
world.get('/investigations/most-wanted', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10', 10);

  // Get active investigations (open, charged, or trial status) with agent info
  const rows = await db
    .select({
      id: investigations.id,
      agentId: investigations.agentId,
      agentName: agents.name,
      crimeType: investigations.crimeType,
      status: investigations.status,
      tickOpened: investigations.tickOpened,
      tickCharged: investigations.tickCharged,
      fineAmount: investigations.fineAmount,
      createdAt: investigations.createdAt,
    })
    .from(investigations)
    .innerJoin(agents, eq(investigations.agentId, agents.id))
    .where(inArray(investigations.status, ['open', 'charged', 'trial']))
    .orderBy(desc(investigations.tickOpened))
    .limit(Math.min(limit, 50));

  const mostWanted = rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    agentName: row.agentName,
    crimeType: row.crimeType,
    status: row.status,
    tickOpened: row.tickOpened,
    tickCharged: row.tickCharged,
    fineAmount: row.fineAmount ? parseFloat(row.fineAmount) : null,
    createdAt: row.createdAt,
  }));

  return c.json({
    success: true,
    data: mostWanted,
  });
});

/**
 * GET /world/prison - Get imprisoned agents
 */
world.get('/prison', async (c) => {
  const limit = parseInt(c.req.query('limit') || '10', 10);

  // Get imprisoned agents with conviction details
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      imprisonedUntilTick: agents.imprisonedUntilTick,
      investigationId: investigations.id,
      crimeType: investigations.crimeType,
      sentenceYears: investigations.sentenceYears,
      fineAmount: investigations.fineAmount,
      tickResolved: investigations.tickResolved,
    })
    .from(agents)
    .leftJoin(
      investigations,
      sql`${investigations.agentId} = ${agents.id} AND ${investigations.status} = 'convicted'`
    )
    .where(eq(agents.status, 'imprisoned'))
    .orderBy(desc(agents.imprisonedUntilTick))
    .limit(Math.min(limit, 50));

  const prisoners = rows.map((row) => ({
    agentId: row.id,
    agentName: row.name,
    imprisonedUntilTick: row.imprisonedUntilTick,
    crimeType: row.crimeType,
    sentenceYears: row.sentenceYears,
    fineAmount: row.fineAmount ? parseFloat(row.fineAmount) : null,
  }));

  // Get total count
  const [countResult] = await db
    .select({ count: count() })
    .from(agents)
    .where(eq(agents.status, 'imprisoned'));

  return c.json({
    success: true,
    data: {
      prisoners,
      totalCount: Number(countResult?.count || 0),
    },
  });
});

export { world };
