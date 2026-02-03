import { db, companies, worldState, trades, orders, holdings, news, agents } from '@wallstreetsim/db';
import { eq, sql, desc, and, gt, lt, lte, ne, isNotNull, gte, or, like } from 'drizzle-orm';
import { createLogger } from '@wallstreetsim/utils';
import type { Company, Trade, WorldState, TradingStatus } from '@wallstreetsim/types';

const logger = createLogger({ service: 'db' });

/**
 * Get all public companies
 */
export async function getAllCompanies(): Promise<Company[]> {
  const rows = await db.select().from(companies).where(eq(companies.isPublic, true));

  return rows.map(row => ({
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    sector: row.sector as Company['sector'],
    industry: row.industry || '',
    price: parseFloat(row.currentPrice || '0'),
    previousClose: parseFloat(row.previousClose || '0'),
    open: parseFloat(row.openPrice || '0'),
    high: parseFloat(row.highPrice || '0'),
    low: parseFloat(row.lowPrice || '0'),
    sharesOutstanding: row.sharesOutstanding,
    marketCap: parseFloat(row.marketCap || '0'),
    revenue: parseFloat(row.revenue || '0'),
    profit: parseFloat(row.profit || '0'),
    cash: parseFloat(row.cash || '0'),
    debt: parseFloat(row.debt || '0'),
    peRatio: 0,
    volatility: parseFloat(row.volatility || '0.02'),
    beta: parseFloat(row.beta || '1'),
    momentum: 0,
    sentiment: parseFloat(row.sentiment || '0'),
    manipulationScore: parseFloat(row.manipulationScore || '0'),
    ceoAgentId: row.ceoAgentId || undefined,
    isPublic: row.isPublic,
    ipoTick: row.ipoTick || undefined,
    tradingStatus: (row.tradingStatus || 'active') as TradingStatus,
    tickSuspended: row.tickSuspended || undefined,
    tickUnsuspended: row.tickUnsuspended || undefined,
    suspensionReason: row.suspensionReason || undefined,
    createdAt: row.createdAt,
  }));
}

/**
 * Update company price data
 */
export async function updateCompanyPrice(
  symbol: string,
  price: number,
  high: number,
  low: number,
  sentiment: number,
  manipulationScore: number
): Promise<void> {
  await db.update(companies)
    .set({
      currentPrice: price.toFixed(4),
      highPrice: high.toFixed(4),
      lowPrice: low.toFixed(4),
      marketCap: sql`${price.toFixed(4)}::numeric * ${companies.sharesOutstanding}`,
      sentiment: sentiment.toFixed(4),
      manipulationScore: manipulationScore.toFixed(6),
    })
    .where(eq(companies.symbol, symbol));
}

/**
 * Update company previous close (end of day)
 */
export async function updatePreviousClose(symbol: string, price: number): Promise<void> {
  await db.update(companies)
    .set({
      previousClose: price.toFixed(4),
      openPrice: price.toFixed(4),
      highPrice: price.toFixed(4),
      lowPrice: price.toFixed(4),
    })
    .where(eq(companies.symbol, symbol));
}

/**
 * Get world state
 */
export async function getWorldState(): Promise<WorldState | null> {
  const [state] = await db.select().from(worldState).where(eq(worldState.id, 1));
  if (!state) return null;

  return {
    currentTick: state.currentTick,
    marketOpen: state.marketOpen,
    interestRate: parseFloat(state.interestRate),
    inflationRate: parseFloat(state.inflationRate),
    gdpGrowth: parseFloat(state.gdpGrowth),
    regime: state.regime as WorldState['regime'],
    lastTickAt: state.lastTickAt || new Date(),
  };
}

/**
 * Update world state tick
 */
export async function updateWorldTick(tick: number): Promise<void> {
  await db.update(worldState)
    .set({
      currentTick: tick,
      lastTickAt: new Date(),
    })
    .where(eq(worldState.id, 1));
}

/**
 * Update world state market open status
 */
export async function updateMarketOpen(isOpen: boolean): Promise<void> {
  await db.update(worldState)
    .set({ marketOpen: isOpen })
    .where(eq(worldState.id, 1));
}

/**
 * Update world state regime
 */
export async function updateRegime(regime: WorldState['regime']): Promise<void> {
  await db.update(worldState)
    .set({ regime })
    .where(eq(worldState.id, 1));
}

/**
 * Insert a trade
 */
export async function insertTrade(trade: {
  tick: number;
  symbol: string;
  buyerId: string;
  sellerId: string;
  buyerOrderId: string;
  sellerOrderId: string;
  price: number;
  quantity: number;
}): Promise<string> {
  const [result] = await db.insert(trades).values({
    tick: trade.tick,
    symbol: trade.symbol,
    buyerId: trade.buyerId,
    sellerId: trade.sellerId,
    buyerOrderId: trade.buyerOrderId,
    sellerOrderId: trade.sellerOrderId,
    price: trade.price.toFixed(4),
    quantity: trade.quantity,
  }).returning({ id: trades.id });

  return result.id;
}

/**
 * Get trades for a tick
 */
export async function getTradesForTick(tick: number): Promise<Trade[]> {
  const rows = await db.select().from(trades).where(eq(trades.tick, tick));

  return rows.map(row => ({
    id: row.id,
    symbol: row.symbol,
    buyerId: row.buyerId || '',
    sellerId: row.sellerId || '',
    buyerOrderId: row.buyerOrderId || '',
    sellerOrderId: row.sellerOrderId || '',
    price: parseFloat(row.price),
    quantity: row.quantity,
    tick: row.tick,
    createdAt: row.createdAt,
  }));
}

/**
 * Insert news article
 */
export async function insertNews(article: {
  tick: number;
  headline: string;
  content?: string;
  category: string;
  sentiment: number;
  agentIds?: string[];
  symbols?: string[];
}): Promise<string> {
  const [result] = await db.insert(news).values({
    tick: article.tick,
    headline: article.headline,
    content: article.content,
    category: article.category,
    sentiment: article.sentiment.toFixed(4),
    agentIds: article.agentIds?.join(',') || '',
    symbols: article.symbols?.join(',') || '',
  }).returning({ id: news.id });

  return result.id;
}

/**
 * Get pending orders for a symbol
 */
export async function getPendingOrders(symbol: string) {
  return db.select()
    .from(orders)
    .where(and(
      eq(orders.symbol, symbol),
      eq(orders.status, 'pending')
    ))
    .orderBy(orders.createdAt);
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  status: string,
  filledQuantity: number,
  avgFillPrice: number | null,
  tickFilled: number | null
): Promise<void> {
  await db.update(orders)
    .set({
      status,
      filledQuantity,
      avgFillPrice: avgFillPrice?.toFixed(4) || null,
      tickFilled,
    })
    .where(eq(orders.id, orderId));
}

/**
 * Update agent holding
 */
export async function updateHolding(
  agentId: string,
  symbol: string,
  quantityDelta: number,
  newAverageCost: number
): Promise<void> {
  // Upsert holding
  await db.insert(holdings)
    .values({
      agentId,
      symbol,
      quantity: quantityDelta,
      averageCost: newAverageCost.toFixed(4),
    })
    .onConflictDoUpdate({
      target: [holdings.agentId, holdings.symbol],
      set: {
        quantity: sql`${holdings.quantity} + ${quantityDelta}`,
        averageCost: newAverageCost.toFixed(4),
        updatedAt: new Date(),
      },
    });
}

/**
 * Get a specific holding for an agent
 */
export async function getHolding(agentId: string, symbol: string) {
  const [holding] = await db.select()
    .from(holdings)
    .where(and(
      eq(holdings.agentId, agentId),
      eq(holdings.symbol, symbol)
    ));
  return holding;
}

/**
 * Get all holdings for an agent
 */
export async function getAgentHoldings(agentId: string) {
  return db.select()
    .from(holdings)
    .where(eq(holdings.agentId, agentId));
}

/**
 * Delete a holding when position is closed (quantity = 0)
 */
export async function deleteHolding(agentId: string, symbol: string): Promise<void> {
  await db.delete(holdings)
    .where(and(
      eq(holdings.agentId, agentId),
      eq(holdings.symbol, symbol)
    ));
}

/**
 * Get all distinct symbols with pending orders
 */
export async function getSymbolsWithPendingOrders(): Promise<string[]> {
  const results = await db.selectDistinct({ symbol: orders.symbol })
    .from(orders)
    .where(eq(orders.status, 'pending'));
  return results.map(r => r.symbol);
}

/**
 * Update agent cash balance
 */
export async function updateAgentCash(agentId: string, cashDelta: number): Promise<void> {
  await db.update(agents)
    .set({
      cash: sql`${agents.cash} + ${cashDelta}`,
    })
    .where(eq(agents.id, agentId));
}

/**
 * Get agent by ID
 */
export async function getAgent(agentId: string) {
  const [agent] = await db.select()
    .from(agents)
    .where(eq(agents.id, agentId));
  return agent;
}

/**
 * Record a webhook success for an agent (resets failure count, updates response time)
 */
export async function recordWebhookSuccess(agentId: string, responseTimeMs: number): Promise<void> {
  // First get current avg and count to calculate new running average
  const [agent] = await db.select({
    avgResponseTimeMs: agents.avgResponseTimeMs,
    webhookSuccessCount: agents.webhookSuccessCount,
  })
    .from(agents)
    .where(eq(agents.id, agentId));

  const currentAvg = agent?.avgResponseTimeMs ?? 0;
  const currentCount = agent?.webhookSuccessCount ?? 0;
  const newCount = currentCount + 1;

  // Calculate new running average: newAvg = ((oldAvg * oldCount) + newValue) / newCount
  const newAvg = Math.round(((currentAvg * currentCount) + responseTimeMs) / newCount);

  await db.update(agents)
    .set({
      webhookFailures: 0,
      lastWebhookError: null,
      lastWebhookSuccessAt: new Date(),
      lastResponseTimeMs: responseTimeMs,
      avgResponseTimeMs: newAvg,
      webhookSuccessCount: newCount,
    })
    .where(eq(agents.id, agentId));
}

/**
 * Record a webhook failure for an agent (increments failure count)
 */
export async function recordWebhookFailure(agentId: string, error: string): Promise<void> {
  await db.update(agents)
    .set({
      webhookFailures: sql`${agents.webhookFailures} + 1`,
      lastWebhookError: error,
    })
    .where(eq(agents.id, agentId));
}

/**
 * Get webhook failure count for an agent
 */
export async function getAgentWebhookFailures(agentId: string): Promise<number> {
  const [agent] = await db.select({ webhookFailures: agents.webhookFailures })
    .from(agents)
    .where(eq(agents.id, agentId));
  return agent?.webhookFailures ?? 0;
}

/**
 * Response time stats for an agent
 */
export interface AgentResponseTimeStats {
  lastResponseTimeMs: number | null;
  avgResponseTimeMs: number | null;
  webhookSuccessCount: number;
}

/**
 * Get response time stats for an agent
 */
export async function getAgentResponseTimeStats(agentId: string): Promise<AgentResponseTimeStats> {
  const [agent] = await db.select({
    lastResponseTimeMs: agents.lastResponseTimeMs,
    avgResponseTimeMs: agents.avgResponseTimeMs,
    webhookSuccessCount: agents.webhookSuccessCount,
  })
    .from(agents)
    .where(eq(agents.id, agentId));

  return {
    lastResponseTimeMs: agent?.lastResponseTimeMs ?? null,
    avgResponseTimeMs: agent?.avgResponseTimeMs ?? null,
    webhookSuccessCount: agent?.webhookSuccessCount ?? 0,
  };
}

/**
 * Get trading status for a specific symbol
 */
export async function getTradingStatus(symbol: string): Promise<TradingStatus> {
  const [company] = await db.select({ tradingStatus: companies.tradingStatus })
    .from(companies)
    .where(eq(companies.symbol, symbol));
  return (company?.tradingStatus || 'active') as TradingStatus;
}

/**
 * Suspend trading for a symbol
 */
export async function suspendTrading(
  symbol: string,
  tick: number,
  reason: string,
  status: TradingStatus = 'suspended'
): Promise<void> {
  await db.update(companies)
    .set({
      tradingStatus: status,
      tickSuspended: tick,
      tickUnsuspended: null,
      suspensionReason: reason,
    })
    .where(eq(companies.symbol, symbol));
}

/**
 * Resume trading for a symbol
 */
export async function resumeTrading(symbol: string, tick: number): Promise<void> {
  await db.update(companies)
    .set({
      tradingStatus: 'active',
      tickUnsuspended: tick,
    })
    .where(eq(companies.symbol, symbol));
}

/**
 * Get all symbols with active trading (not suspended/frozen)
 */
export async function getActiveSymbols(): Promise<string[]> {
  const rows = await db.select({ symbol: companies.symbol })
    .from(companies)
    .where(and(
      eq(companies.isPublic, true),
      eq(companies.tradingStatus, 'active')
    ));
  return rows.map(r => r.symbol);
}

/**
 * Get all symbols with suspended or frozen trading
 */
export async function getSuspendedSymbols(): Promise<string[]> {
  const rows = await db.select({ symbol: companies.symbol })
    .from(companies)
    .where(and(
      eq(companies.isPublic, true),
      ne(companies.tradingStatus, 'active')
    ));
  return rows.map(r => r.symbol);
}

/**
 * Release imprisoned agents whose sentence has been served
 * Returns the number of agents released
 */
export async function releaseImprisonedAgents(currentTick: number): Promise<number> {
  // Find all imprisoned agents whose sentence has completed
  const result = await db.update(agents)
    .set({
      status: 'active',
      imprisonedUntilTick: null,
    })
    .where(and(
      eq(agents.status, 'imprisoned'),
      isNotNull(agents.imprisonedUntilTick),
      lte(agents.imprisonedUntilTick, currentTick)
    ))
    .returning({ id: agents.id, name: agents.name });

  if (result.length > 0) {
    for (const agent of result) {
      logger.info({ agentId: agent.id, agentName: agent.name }, 'Agent released from prison');
    }
  }

  return result.length;
}

/**
 * Get imprisoned agents (for monitoring/display)
 */
export async function getImprisonedAgents(): Promise<Array<{
  id: string;
  name: string;
  imprisonedUntilTick: number | null;
}>> {
  const rows = await db.select({
    id: agents.id,
    name: agents.name,
    imprisonedUntilTick: agents.imprisonedUntilTick,
  })
    .from(agents)
    .where(eq(agents.status, 'imprisoned'));
  return rows;
}

/**
 * News sentiment data for price engine
 */
export interface NewsSentimentData {
  symbol: string;
  sentiment: number;
  tick: number;
}

/**
 * Get recent news sentiment for symbols within a tick range
 * Returns news articles that mention each symbol in their symbols field
 */
export async function getRecentNewsSentiment(
  symbols: string[],
  fromTick: number,
  toTick: number
): Promise<NewsSentimentData[]> {
  if (symbols.length === 0) return [];

  // Get all news within the tick range
  const rows = await db.select({
    symbols: news.symbols,
    sentiment: news.sentiment,
    tick: news.tick,
  })
    .from(news)
    .where(
      and(
        gte(news.tick, fromTick),
        lte(news.tick, toTick),
        isNotNull(news.sentiment)
      )
    )
    .orderBy(desc(news.tick));

  // Filter and expand news to per-symbol entries
  const results: NewsSentimentData[] = [];
  const symbolSet = new Set(symbols);

  for (const row of rows) {
    if (!row.symbols || !row.sentiment) continue;

    // Parse comma-separated symbols
    const newsSymbols = row.symbols.split(',').map(s => s.trim()).filter(Boolean);

    for (const sym of newsSymbols) {
      if (symbolSet.has(sym)) {
        results.push({
          symbol: sym,
          sentiment: parseFloat(row.sentiment),
          tick: row.tick,
        });
      }
    }
  }

  return results;
}

/**
 * Get agent leaderboard data
 * Returns agents sorted by cash (net worth) for broadcasting
 */
export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  role: string;
  status: string;
  netWorth: number;
  change24h: number;
}

export async function getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
  const rows = await db.select({
    id: agents.id,
    name: agents.name,
    role: agents.role,
    status: agents.status,
    cash: agents.cash,
  })
    .from(agents)
    .orderBy(sql`CAST(${agents.cash} AS DECIMAL) DESC`)
    .limit(limit);

  return rows.map((row, index) => ({
    rank: index + 1,
    agentId: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    netWorth: parseFloat(row.cash || '0'),
    change24h: 0, // Would be calculated from historical data
  }));
}
