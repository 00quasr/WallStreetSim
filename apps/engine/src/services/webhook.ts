import { db, agents, holdings, orders } from '@wallstreetsim/db';
import { eq, and, isNotNull, inArray } from 'drizzle-orm';
import type { TickWebhook, AgentAction, Order } from '@wallstreetsim/types';
import type { PriceUpdate, Trade, MarketEvent, NewsArticle, WorldState } from '@wallstreetsim/types';
import {
  signWebhookPayload,
  retryWithBackoff,
  isRetryableStatusCode,
  RETRY_PROFILES,
} from '@wallstreetsim/utils';
import type { RetryResult } from '@wallstreetsim/utils';
import * as dbService from './db';

interface AgentWithCallback {
  id: string;
  name: string;
  callbackUrl: string;
  webhookSecret: string | null;
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
  attempts?: number;
}

interface WebhookDispatcherConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: WebhookDispatcherConfig = {
  timeoutMs: 5000,
  maxRetries: 3,
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
    webhookSecret: agents.webhookSecret,
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
 * Get agent's active orders (pending, open, partial)
 */
async function getAgentOrders(agentId: string): Promise<Order[]> {
  const orderRows = await db.select()
    .from(orders)
    .where(and(
      eq(orders.agentId, agentId),
      inArray(orders.status, ['pending', 'open', 'partial'])
    ));

  return orderRows.map(o => ({
    id: o.id,
    agentId: o.agentId,
    symbol: o.symbol,
    side: o.side as 'BUY' | 'SELL',
    type: o.orderType as 'MARKET' | 'LIMIT' | 'STOP',
    quantity: o.quantity,
    price: o.price ? parseFloat(o.price) : undefined,
    stopPrice: o.stopPrice ? parseFloat(o.stopPrice) : undefined,
    status: o.status as Order['status'],
    filledQuantity: o.filledQuantity,
    avgFillPrice: o.avgFillPrice ? parseFloat(o.avgFillPrice) : undefined,
    tickSubmitted: o.tickSubmitted,
    tickFilled: o.tickFilled ?? undefined,
    createdAt: o.createdAt,
  }));
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

  // Fetch portfolio and orders in parallel
  const [portfolio, agentOrders] = await Promise.all([
    getAgentPortfolio(agent.id, cash, marginUsed, marginLimit, priceMap),
    getAgentOrders(agent.id),
  ]);

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
    orders: agentOrders,
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
 * Error class for webhook failures that includes HTTP status code
 */
class WebhookError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isTimeout: boolean = false
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

/**
 * Perform a single webhook attempt
 */
async function attemptWebhook(
  agent: AgentWithCallback,
  payload: TickWebhook,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ statusCode: number; actions?: AgentAction[] }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(agent.callbackUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new WebhookError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    // Parse response for actions
    let actions: AgentAction[] | undefined;
    try {
      const responseBody = await response.json() as { actions?: AgentAction[] };
      if (responseBody.actions && Array.isArray(responseBody.actions)) {
        actions = responseBody.actions;
      }
    } catch {
      // Response may not have a body or may not be JSON
    }

    return { statusCode: response.status, actions };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof WebhookError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('abort');

    throw new WebhookError(
      isTimeout ? 'Timeout' : errorMessage,
      undefined,
      isTimeout
    );
  }
}

/**
 * Determine if a webhook error should be retried
 */
function shouldRetryWebhook(error: unknown): boolean {
  if (error instanceof WebhookError) {
    // Always retry timeouts
    if (error.isTimeout) {
      return true;
    }

    // Retry on retryable status codes (429, 5xx)
    if (error.statusCode !== undefined) {
      return isRetryableStatusCode(error.statusCode);
    }

    // Retry on network errors (no status code means connection failed)
    return true;
  }

  return false;
}

/**
 * Send webhook to a single agent with retry logic
 */
async function sendWebhook(
  agent: AgentWithCallback,
  payload: TickWebhook,
  config: WebhookDispatcherConfig
): Promise<WebhookResult> {
  const startTime = Date.now();
  const body = JSON.stringify(payload);

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-WallStreetSim-Tick': payload.tick.toString(),
    'X-WallStreetSim-Agent': agent.id,
  };

  // Add HMAC signature if agent has a webhook secret
  if (agent.webhookSecret) {
    headers['X-WallStreetSim-Signature'] = signWebhookPayload(body, agent.webhookSecret);
  }

  // Use retry logic with exponential backoff
  const retryResult: RetryResult<{ statusCode: number; actions?: AgentAction[] }> = await retryWithBackoff(
    () => attemptWebhook(agent, payload, body, headers, config.timeoutMs),
    {
      ...RETRY_PROFILES.WEBHOOK,
      maxRetries: config.maxRetries,
      shouldRetry: shouldRetryWebhook,
      onRetry: (error, attempt, delayMs) => {
        const errorMsg = error instanceof WebhookError ? error.message : 'Unknown error';
        console.log(`  Webhook retry ${attempt}/${config.maxRetries} for agent ${agent.id} after ${delayMs}ms (${errorMsg})`);
      },
    }
  );

  const responseTimeMs = Date.now() - startTime;

  if (retryResult.success && retryResult.data) {
    return {
      agentId: agent.id,
      success: true,
      statusCode: retryResult.data.statusCode,
      actions: retryResult.data.actions,
      responseTimeMs,
      attempts: retryResult.attempts,
    };
  }

  // Extract error details from the last error
  const lastError = retryResult.error;
  let errorMessage = 'Unknown error';
  let statusCode: number | undefined;

  if (lastError instanceof WebhookError) {
    errorMessage = lastError.message;
    statusCode = lastError.statusCode;
  } else if (lastError instanceof Error) {
    errorMessage = lastError.message;
  }

  return {
    agentId: agent.id,
    success: false,
    statusCode,
    error: errorMessage,
    responseTimeMs,
    attempts: retryResult.attempts,
  };
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

  // Track failures/successes per agent
  await Promise.all(
    results.map(async (result) => {
      if (result.success) {
        await dbService.recordWebhookSuccess(result.agentId);
      } else {
        await dbService.recordWebhookFailure(result.agentId, result.error || 'Unknown error');
      }
    })
  );

  // Log results
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const retriedCount = results.filter(r => (r.attempts ?? 1) > 1).length;

  if (results.length > 0) {
    const retryInfo = retriedCount > 0 ? ` (${retriedCount} required retries)` : '';
    console.log(`  Webhooks: ${successful} delivered, ${failed} failed${retryInfo}`);
  }

  return results;
}

export type { WebhookResult, WebhookDispatcherConfig };
