import { Hono } from 'hono';
import { db, agents, orders, actions } from '@wallstreetsim/db';
import { eq } from 'drizzle-orm';
import { SubmitActionsSchema, generateUUID } from '@wallstreetsim/utils';
import { authMiddleware } from '../middleware/auth';
import { actionRateLimiter } from '../middleware/rate-limit';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const actionsRouter = new Hono();

// Apply auth and rate limiting to all routes
actionsRouter.use('*', authMiddleware);
actionsRouter.use('*', actionRateLimiter());

/**
 * POST /actions - Submit agent actions
 */
actionsRouter.post('/', async (c) => {
  const agentId = c.get('agentId');
  const body = await c.req.json();

  // Validate input
  const parsed = SubmitActionsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Validation error',
        details: parsed.error.errors,
      },
      400
    );
  }

  // Get current tick from Redis
  const tickStr = await redis.get('tick:current');
  const currentTick = tickStr ? parseInt(tickStr, 10) : 0;

  // Get agent
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) {
    return c.json({ success: false, error: 'Agent not found' }, 404);
  }

  const results = [];

  for (const action of parsed.data.actions) {
    try {
      const result = await processAction(agentId, agent, action, currentTick);
      results.push(result);

      // Log action
      await db.insert(actions).values({
        tick: currentTick,
        agentId,
        actionType: action.type,
        payload: action,
        result: result.data || null,
        success: result.success,
      });
    } catch (error) {
      results.push({
        action: action.type,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return c.json({
    success: true,
    data: { results },
  });
});

/**
 * Process a single action
 */
async function processAction(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: any,
  tick: number
): Promise<{ action: string; success: boolean; message?: string; data?: any }> {
  switch (action.type) {
    case 'BUY':
    case 'SELL':
    case 'SHORT':
    case 'COVER':
      return processTradeAction(agentId, agent, action, tick);

    case 'CANCEL_ORDER':
      return processCancelOrder(agentId, action.orderId, tick);

    case 'RUMOR':
      return processRumor(agentId, action, tick);

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
      return { action: action.type, success: false, message: 'Unknown action type' };
  }
}

/**
 * Process trade actions (BUY, SELL, SHORT, COVER)
 */
async function processTradeAction(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: any,
  tick: number
) {
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
async function processCancelOrder(agentId: string, orderId: string, tick: number) {
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

  if (order.status !== 'pending') {
    return { action: 'CANCEL_ORDER', success: false, message: 'Order cannot be cancelled' };
  }

  await db.update(orders)
    .set({ status: 'cancelled' })
    .where(eq(orders.id, orderId));

  return { action: 'CANCEL_ORDER', success: true, message: 'Order cancelled' };
}

/**
 * Process rumor action
 */
async function processRumor(agentId: string, action: any, tick: number) {
  // In production: validate reputation, check cooldowns, trigger news generation
  return {
    action: 'RUMOR',
    success: true,
    message: 'Rumor spreading...',
    data: { symbol: action.targetSymbol },
  };
}

/**
 * Process message action
 */
async function processMessage(agentId: string, action: any, tick: number) {
  // In production: store message, notify target agent
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
async function processAllyRequest(agentId: string, action: any, tick: number) {
  // In production: create alliance request, notify target agent
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
  action: any,
  tick: number
) {
  const { targetAgent, amount } = action;
  const agentCash = parseFloat(agent.cash || '0');

  if (amount > agentCash) {
    return { action: 'BRIBE', success: false, message: 'Insufficient funds' };
  }

  // Deduct cash
  await db.update(agents)
    .set({ cash: (agentCash - amount).toFixed(2) })
    .where(eq(agents.id, agentId));

  // In production: implement bribe logic, risk of detection
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
async function processWhistleblow(agentId: string, action: any, tick: number) {
  // In production: trigger SEC investigation on target
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
  action: any,
  tick: number
) {
  // Check if under investigation
  // In production: implement escape mechanics, freeze assets

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

export { actionsRouter };
