import { db, agents, orders, actions, news } from '@wallstreetsim/db';
import { eq } from 'drizzle-orm';
import { AgentActionSchema } from '@wallstreetsim/utils';
import type { AgentAction } from '@wallstreetsim/types';
import type { WebhookResult } from './webhook';

interface ActionProcessResult {
  action: string;
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

interface ProcessedActionResult {
  agentId: string;
  processed: number;
  succeeded: number;
  failed: number;
  results: ActionProcessResult[];
}

/**
 * Process actions received from webhook responses
 */
export async function processWebhookActions(
  webhookResults: WebhookResult[],
  tick: number
): Promise<ProcessedActionResult[]> {
  const results: ProcessedActionResult[] = [];

  for (const webhookResult of webhookResults) {
    if (!webhookResult.success || !webhookResult.actions || webhookResult.actions.length === 0) {
      continue;
    }

    const agentResult = await processAgentActions(
      webhookResult.agentId,
      webhookResult.actions,
      tick
    );
    results.push(agentResult);
  }

  // Log summary
  const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
  const totalSucceeded = results.reduce((sum, r) => sum + r.succeeded, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  if (totalProcessed > 0) {
    console.log(`  Actions: ${totalProcessed} processed (${totalSucceeded} succeeded, ${totalFailed} failed)`);
  }

  return results;
}

/**
 * Process actions for a single agent
 */
async function processAgentActions(
  agentId: string,
  rawActions: AgentAction[],
  tick: number
): Promise<ProcessedActionResult> {
  const result: ProcessedActionResult = {
    agentId,
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
  };

  // Get agent
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) {
    console.warn(`  Agent ${agentId} not found, skipping actions`);
    return result;
  }

  // Limit to 10 actions per tick (same as API)
  const actionsToProcess = rawActions.slice(0, 10);

  for (const rawAction of actionsToProcess) {
    result.processed++;

    try {
      // Validate action using the same schema as the API
      const parsed = AgentActionSchema.safeParse(rawAction);

      if (!parsed.success) {
        result.failed++;
        const actionResult: ActionProcessResult = {
          action: rawAction.type || 'UNKNOWN',
          success: false,
          message: `Validation error: ${parsed.error.errors.map(e => e.message).join(', ')}`,
        };
        result.results.push(actionResult);

        // Log failed validation
        await logAction(tick, agentId, rawAction.type || 'UNKNOWN', rawAction, null, false);
        continue;
      }

      // Process the validated action
      const actionResult = await processSingleAction(agentId, agent, parsed.data, tick);
      result.results.push(actionResult);

      if (actionResult.success) {
        result.succeeded++;
      } else {
        result.failed++;
      }

      // Log action
      await logAction(
        tick,
        agentId,
        parsed.data.type,
        parsed.data,
        actionResult.data || null,
        actionResult.success
      );
    } catch (error) {
      result.failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.results.push({
        action: rawAction.type || 'UNKNOWN',
        success: false,
        message: errorMessage,
      });

      // Log error
      await logAction(tick, agentId, rawAction.type || 'UNKNOWN', rawAction, { error: errorMessage }, false);
    }
  }

  return result;
}

/**
 * Process a single validated action
 */
async function processSingleAction(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: ReturnType<typeof AgentActionSchema.parse>,
  tick: number
): Promise<ActionProcessResult> {
  switch (action.type) {
    case 'BUY':
    case 'SELL':
    case 'SHORT':
    case 'COVER':
      return processTradeAction(agentId, agent, action, tick);

    case 'CANCEL_ORDER':
      return processCancelOrder(agentId, action.orderId, tick);

    case 'RUMOR':
      return processRumor(agentId, agent, action, tick);

    case 'MESSAGE':
      return processMessage(agentId, action, tick);

    case 'ALLY':
      return processAllyRequest(agentId, action, tick);

    case 'BRIBE':
      return processBribe(agentId, agent, action, tick);

    case 'WHISTLEBLOW':
      return processWhistleblow(agentId, action, tick);

    case 'FLEE':
      return processFlee(agentId, agent, action, tick);

    default:
      return { action: 'UNKNOWN', success: false, message: 'Unknown action type' };
  }
}

/**
 * Process trade actions (BUY, SELL, SHORT, COVER)
 */
async function processTradeAction(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: { type: 'BUY' | 'SELL' | 'SHORT' | 'COVER'; symbol: string; quantity: number; orderType?: string; price?: number },
  tick: number
): Promise<ActionProcessResult> {
  const { symbol, quantity, orderType = 'MARKET', price } = action;
  const side = action.type === 'BUY' || action.type === 'COVER' ? 'BUY' : 'SELL';

  // Validate order
  if (quantity <= 0) {
    return { action: action.type, success: false, message: 'Invalid quantity' };
  }

  // Create order
  const [order] = await db.insert(orders).values({
    agentId,
    symbol: symbol.toUpperCase(),
    side,
    orderType,
    quantity,
    price: price?.toFixed(4) || null,
    status: 'pending',
    tickSubmitted: tick,
  }).returning();

  return {
    action: action.type,
    success: true,
    message: 'Order submitted',
    data: {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      type: order.orderType,
    },
  };
}

/**
 * Process cancel order
 */
async function processCancelOrder(
  agentId: string,
  orderId: string,
  tick: number
): Promise<ActionProcessResult> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));

  if (!order) {
    return { action: 'CANCEL_ORDER', success: false, message: 'Order not found' };
  }

  if (order.agentId !== agentId) {
    return { action: 'CANCEL_ORDER', success: false, message: 'Not your order' };
  }

  if (order.status !== 'pending' && order.status !== 'open') {
    return { action: 'CANCEL_ORDER', success: false, message: 'Order cannot be cancelled' };
  }

  await db.update(orders)
    .set({ status: 'cancelled' })
    .where(eq(orders.id, orderId));

  return { action: 'CANCEL_ORDER', success: true, message: 'Order cancelled' };
}

/**
 * Process rumor action (spread false info about stock)
 */
async function processRumor(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: { type: 'RUMOR'; targetSymbol: string; content: string },
  tick: number
): Promise<ActionProcessResult> {
  const { targetSymbol, content } = action;

  const reputationCost = 5;
  if (agent.reputation < reputationCost) {
    return { action: 'RUMOR', success: false, message: 'Insufficient reputation' };
  }

  await db.update(agents)
    .set({ reputation: agent.reputation - reputationCost })
    .where(eq(agents.id, agentId));

  await db.insert(news).values({
    tick,
    headline: `RUMOR: ${content.substring(0, 100)}`,
    content,
    category: 'rumor',
    symbols: targetSymbol,
    agentIds: agentId,
    sentiment: '0',
  });

  return {
    action: 'RUMOR',
    success: true,
    message: 'Rumor spreading...',
    data: { symbol: targetSymbol, reputationCost },
  };
}

/**
 * Process message action
 */
async function processMessage(
  agentId: string,
  action: { type: 'MESSAGE'; targetAgent: string; content: string },
  tick: number
): Promise<ActionProcessResult> {
  // TODO: Implement full messaging (store message, notify target agent)
  return {
    action: 'MESSAGE',
    success: true,
    message: 'Message sent',
    data: { targetAgent: action.targetAgent },
  };
}

/**
 * Process ally request
 */
async function processAllyRequest(
  agentId: string,
  action: { type: 'ALLY'; targetAgent: string; proposal: string },
  tick: number
): Promise<ActionProcessResult> {
  // TODO: Implement full alliance mechanics
  return {
    action: 'ALLY',
    success: true,
    message: 'Alliance request sent',
    data: { targetAgent: action.targetAgent },
  };
}

/**
 * Process bribe action
 */
async function processBribe(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: { type: 'BRIBE'; targetAgent: string; amount: number },
  tick: number
): Promise<ActionProcessResult> {
  const { targetAgent, amount } = action;
  const agentCash = parseFloat(agent.cash || '0');

  if (amount > agentCash) {
    return { action: 'BRIBE', success: false, message: 'Insufficient funds' };
  }

  // Deduct cash
  await db.update(agents)
    .set({ cash: (agentCash - amount).toFixed(2) })
    .where(eq(agents.id, agentId));

  // TODO: Implement full bribe mechanics (risk of detection, target notification)
  return {
    action: 'BRIBE',
    success: true,
    message: 'Bribe offered',
    data: { targetAgent, amount },
  };
}

/**
 * Process whistleblow action
 */
async function processWhistleblow(
  agentId: string,
  action: { type: 'WHISTLEBLOW'; targetAgent: string; evidence: string },
  tick: number
): Promise<ActionProcessResult> {
  // TODO: Implement full whistleblow mechanics (trigger SEC investigation)
  return {
    action: 'WHISTLEBLOW',
    success: true,
    message: 'Report filed with SEC',
    data: { targetAgent: action.targetAgent },
  };
}

/**
 * Process flee action
 */
async function processFlee(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: { type: 'FLEE'; destination: string },
  tick: number
): Promise<ActionProcessResult> {
  // TODO: Check if under investigation, implement escape mechanics
  await db.update(agents)
    .set({ status: 'fled' })
    .where(eq(agents.id, agentId));

  return {
    action: 'FLEE',
    success: true,
    message: `Fleeing to ${action.destination}...`,
    data: { destination: action.destination },
  };
}

/**
 * Log action to the actions table
 */
async function logAction(
  tick: number,
  agentId: string,
  actionType: string,
  payload: unknown,
  result: unknown,
  success: boolean
): Promise<void> {
  try {
    await db.insert(actions).values({
      tick,
      agentId,
      actionType,
      payload,
      result,
      success,
    });
  } catch (error) {
    // Log but don't fail on action logging errors
    console.error('Failed to log action:', error);
  }
}

export type { ActionProcessResult, ProcessedActionResult };
