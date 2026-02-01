import { db, agents, holdings } from '@wallstreetsim/db';
import { eq, and, isNotNull } from 'drizzle-orm';
import type { TickWebhook, AgentAction } from '@wallstreetsim/types';
import type { PriceUpdate, Trade, MarketEvent, NewsArticle, WorldState } from '@wallstreetsim/types';

interface AgentWithCallback {
  id: string;
  name: string;
  callbackUrl: string;
  cash: string;
  marginUsed: string;
  marginLimit: string;
}

interface WebhookResult {
  agentId: string;
  success: boolean;
  statusCode?: number;
  actions?: AgentAction[];
  error?: string;
  responseTimeMs: number;
}

interface WebhookDispatcherConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: WebhookDispatcherConfig = {
  timeoutMs: 5000,
  maxRetries: 0,
  retryDelayMs: 1000,
};

/**
 * Get all active agents with callback URLs
 */
export async function getAgentsWithCallbacks(): Promise<AgentWithCallback[]> {
  const rows = await db.select({
    id: agents.id,
    name: agents.name,
    callbackUrl: agents.callbackUrl,
    cash: agents.cash,
    marginUsed: agents.marginUsed,
    marginLimit: agents.marginLimit,
  })
    .from(agents)
    .where(and(
      eq(agents.status, 'active'),
      isNotNull(agents.callbackUrl)
    ));

  return rows.filter((row): row is AgentWithCallback => row.callbackUrl !== null);
}

/**
 * Get agent's holdings with current prices
 */
async function getAgentPortfolio(agentId: string, cash: number, marginUsed: number, marginLimit: number, priceMap: Map<string, number>) {
  const holdingsRows = await db.select()
    .from(holdings)
    .where(eq(holdings.agentId, agentId));

  const positions = holdingsRows.map(h => {
    const currentPrice = priceMap.get(h.symbol) || 0;
    const averageCost = parseFloat(h.averageCost);
    const marketValue = h.quantity * currentPrice;
    const costBasis = h.quantity * averageCost;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    return {
      symbol: h.symbol,
      shares: h.quantity,
      averageCost,
      currentPrice,
      marketValue,
      unrealizedPnL,
      unrealizedPnLPercent,
    };
  });

  const positionsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const netWorth = cash + positionsValue;

  return {
    agentId,
    cash,
    marginUsed,
    marginAvailable: marginLimit - marginUsed,
    netWorth,
    positions,
  };
}

/**
 * Build webhook payload for an agent
 */
export async function buildWebhookPayload(
  agent: AgentWithCallback,
  tick: number,
  worldState: WorldState,
  priceUpdates: PriceUpdate[],
  trades: Trade[],
  events: MarketEvent[],
  news: NewsArticle[],
  priceMap: Map<string, number>
): Promise<TickWebhook> {
  const cash = parseFloat(agent.cash);
  const marginUsed = parseFloat(agent.marginUsed);
  const marginLimit = parseFloat(agent.marginLimit);

  const portfolio = await getAgentPortfolio(agent.id, cash, marginUsed, marginLimit, priceMap);

  // Get trades relevant to this agent
  const agentTrades = trades.filter(t => t.buyerId === agent.id || t.sellerId === agent.id);

  // Build market data
  const watchlist = priceUpdates.map(u => ({
    symbol: u.symbol,
    name: u.symbol, // Simplified - could fetch from companies table
    sector: 'unknown', // Simplified - could fetch from companies table
    price: u.newPrice,
    change: u.change,
    changePercent: u.changePercent,
    volume: u.volume,
    high: u.newPrice,
    low: u.newPrice,
    marketCap: 0, // Simplified - could fetch from companies table
  }));

  return {
    tick,
    timestamp: new Date().toISOString(),
    portfolio,
    market: {
      indices: [], // Could add market indices here
      watchlist,
      recentTrades: agentTrades,
    },
    world: worldState,
    news,
    messages: [], // Could fetch agent messages here
    alerts: [], // Could fetch agent alerts here
  };
}

/**
 * Send webhook to a single agent
 */
async function sendWebhook(
  agent: AgentWithCallback,
  payload: TickWebhook,
  config: WebhookDispatcherConfig
): Promise<WebhookResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    const response = await fetch(agent.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WallStreetSim-Tick': payload.tick.toString(),
        'X-WallStreetSim-Agent': agent.id,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        agentId: agent.id,
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTimeMs,
      };
    }

    // Parse response for actions
    let actions: AgentAction[] | undefined;
    try {
      const body = await response.json() as { actions?: AgentAction[] };
      if (body.actions && Array.isArray(body.actions)) {
        actions = body.actions;
      }
    } catch {
      // Response may not have a body or may not be JSON
    }

    return {
      agentId: agent.id,
      success: true,
      statusCode: response.status,
      actions,
      responseTimeMs,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      agentId: agent.id,
      success: false,
      error: errorMessage.includes('aborted') ? 'Timeout' : errorMessage,
      responseTimeMs,
    };
  }
}

/**
 * Dispatch webhooks to all agents with callback URLs
 */
export async function dispatchWebhooks(
  tick: number,
  worldState: WorldState,
  priceUpdates: PriceUpdate[],
  trades: Trade[],
  events: MarketEvent[],
  news: NewsArticle[],
  config: Partial<WebhookDispatcherConfig> = {}
): Promise<WebhookResult[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Get all agents with callback URLs
  const agentsWithCallbacks = await getAgentsWithCallbacks();

  if (agentsWithCallbacks.length === 0) {
    return [];
  }

  // Build price map for quick lookup
  const priceMap = new Map<string, number>();
  for (const update of priceUpdates) {
    priceMap.set(update.symbol, update.newPrice);
  }

  // Build payloads and send webhooks in parallel
  const results = await Promise.all(
    agentsWithCallbacks.map(async (agent) => {
      const payload = await buildWebhookPayload(
        agent,
        tick,
        worldState,
        priceUpdates,
        trades,
        events,
        news,
        priceMap
      );

      return sendWebhook(agent, payload, fullConfig);
    })
  );

  // Log results
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  if (results.length > 0) {
    console.log(`  Webhooks: ${successful} delivered, ${failed} failed`);
  }

  return results;
}

export type { WebhookResult, WebhookDispatcherConfig };
