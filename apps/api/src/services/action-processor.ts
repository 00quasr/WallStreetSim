import { db, agents, orders, actions, messages, investigations, alliances, news } from '@wallstreetsim/db';
import { eq, and } from 'drizzle-orm';
import type { AgentActionInput } from '@wallstreetsim/utils';

export interface ActionResult {
  action: string;
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface ProcessActionContext {
  agentId: string;
  agent: typeof agents.$inferSelect;
  tick: number;
}

export async function processAction(
  context: ProcessActionContext,
  action: AgentActionInput
): Promise<ActionResult> {
  const { agentId, agent, tick } = context;

  switch (action.type) {
    case 'BUY':
    case 'SELL':
    case 'SHORT':
    case 'COVER':
      return processTradeAction(context, action);

    case 'CANCEL_ORDER':
      return processCancelOrder(agentId, action.orderId, tick);

    case 'RUMOR':
      return processRumor(agentId, agent, action, tick);

    case 'MESSAGE':
      return processMessage(agentId, action, tick);

    case 'ALLY':
      return processAllyRequest(agentId, action, tick);

    case 'ALLY_ACCEPT':
      return processAllyAccept(agentId, action, tick);

    case 'ALLY_REJECT':
      return processAllyReject(agentId, action, tick);

    case 'BRIBE':
      return processBribe(agentId, agent, action, tick);

    case 'WHISTLEBLOW':
      return processWhistleblow(agentId, action, tick);

    case 'FLEE':
      return processFlee(agentId, agent, action, tick);

    default:
      return { action: (action as { type: string }).type, success: false, message: 'Unknown action type' };
  }
}

export async function logAction(
  context: ProcessActionContext,
  action: AgentActionInput,
  result: ActionResult
): Promise<void> {
  const targetAgentId = getTargetAgentId(action);
  const targetSymbol = getTargetSymbol(action);

  await db.insert(actions).values({
    tick: context.tick,
    agentId: context.agentId,
    actionType: action.type,
    targetAgentId,
    targetSymbol,
    payload: action,
    result: result.data || null,
    success: result.success,
  });
}

function getTargetAgentId(action: AgentActionInput): string | undefined {
  if ('targetAgent' in action && typeof action.targetAgent === 'string') {
    return action.targetAgent;
  }
  return undefined;
}

function getTargetSymbol(action: AgentActionInput): string | undefined {
  if ('symbol' in action && typeof action.symbol === 'string') {
    return action.symbol;
  }
  if ('targetSymbol' in action && typeof action.targetSymbol === 'string') {
    return action.targetSymbol;
  }
  return undefined;
}

async function processTradeAction(
  context: ProcessActionContext,
  action: Extract<AgentActionInput, { type: 'BUY' | 'SELL' | 'SHORT' | 'COVER' }>
): Promise<ActionResult> {
  const { agentId, agent, tick } = context;
  const { symbol, quantity, orderType = 'MARKET', price } = action;
  const side = action.type === 'BUY' || action.type === 'COVER' ? 'BUY' : 'SELL';

  if (quantity <= 0) {
    return { action: action.type, success: false, message: 'Invalid quantity' };
  }

  if (agent.status !== 'active') {
    return { action: action.type, success: false, message: `Agent status is ${agent.status}` };
  }

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

async function processCancelOrder(
  agentId: string,
  orderId: string,
  tick: number
): Promise<ActionResult> {
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

  return {
    action: 'CANCEL_ORDER',
    success: true,
    message: 'Order cancelled',
    data: { orderId },
  };
}

async function processRumor(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: Extract<AgentActionInput, { type: 'RUMOR' }>,
  tick: number
): Promise<ActionResult> {
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

async function processMessage(
  agentId: string,
  action: Extract<AgentActionInput, { type: 'MESSAGE' }>,
  tick: number
): Promise<ActionResult> {
  const { targetAgent, content } = action;

  const [recipient] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, targetAgent));

  if (!recipient) {
    return { action: 'MESSAGE', success: false, message: 'Recipient not found' };
  }

  const [message] = await db.insert(messages).values({
    tick,
    senderId: agentId,
    recipientId: targetAgent,
    channel: 'direct',
    content,
  }).returning();

  return {
    action: 'MESSAGE',
    success: true,
    message: 'Message sent',
    data: { messageId: message.id, targetAgent },
  };
}

async function processAllyRequest(
  agentId: string,
  action: Extract<AgentActionInput, { type: 'ALLY' }>,
  tick: number
): Promise<ActionResult> {
  const { targetAgent, proposal } = action;

  const [target] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, targetAgent));

  if (!target) {
    return { action: 'ALLY', success: false, message: 'Target agent not found' };
  }

  if (target.status !== 'active') {
    return { action: 'ALLY', success: false, message: 'Target agent is not active' };
  }

  const [alliance] = await db.insert(alliances).values({
    name: null,
    status: 'pending',
  }).returning();

  await db.insert(messages).values({
    tick,
    senderId: agentId,
    recipientId: targetAgent,
    channel: 'alliance',
    subject: `Alliance Proposal (${alliance.id})`,
    content: proposal,
  });

  return {
    action: 'ALLY',
    success: true,
    message: 'Alliance request sent',
    data: { allianceId: alliance.id, targetAgent },
  };
}

async function processAllyAccept(
  agentId: string,
  action: Extract<AgentActionInput, { type: 'ALLY_ACCEPT' }>,
  tick: number
): Promise<ActionResult> {
  const { allianceId } = action;

  const [alliance] = await db
    .select()
    .from(alliances)
    .where(eq(alliances.id, allianceId));

  if (!alliance) {
    return { action: 'ALLY_ACCEPT', success: false, message: 'Alliance not found' };
  }

  if (alliance.status !== 'pending') {
    return { action: 'ALLY_ACCEPT', success: false, message: 'Alliance is not pending' };
  }

  // Find the original alliance proposal message to identify the proposer
  const [proposalMessage] = await db
    .select()
    .from(messages)
    .where(and(
      eq(messages.channel, 'alliance'),
      eq(messages.recipientId, agentId)
    ));

  if (!proposalMessage) {
    return { action: 'ALLY_ACCEPT', success: false, message: 'Alliance proposal not found' };
  }

  // Verify the message is for this alliance
  if (!proposalMessage.subject?.includes(allianceId)) {
    return { action: 'ALLY_ACCEPT', success: false, message: 'Alliance proposal mismatch' };
  }

  const proposerId = proposalMessage.senderId;

  // Activate the alliance
  await db.update(alliances)
    .set({
      status: 'active',
      activatedAt: new Date(),
    })
    .where(eq(alliances.id, allianceId));

  // Add both agents to the alliance
  await db.update(agents)
    .set({ allianceId })
    .where(eq(agents.id, agentId));

  await db.update(agents)
    .set({ allianceId })
    .where(eq(agents.id, proposerId));

  // Notify the proposer
  await db.insert(messages).values({
    tick,
    senderId: agentId,
    recipientId: proposerId,
    channel: 'alliance',
    subject: `Alliance Accepted (${allianceId})`,
    content: 'Your alliance proposal has been accepted.',
  });

  return {
    action: 'ALLY_ACCEPT',
    success: true,
    message: 'Alliance formed',
    data: { allianceId, partnerId: proposerId },
  };
}

async function processAllyReject(
  agentId: string,
  action: Extract<AgentActionInput, { type: 'ALLY_REJECT' }>,
  tick: number
): Promise<ActionResult> {
  const { allianceId, reason } = action;

  const [alliance] = await db
    .select()
    .from(alliances)
    .where(eq(alliances.id, allianceId));

  if (!alliance) {
    return { action: 'ALLY_REJECT', success: false, message: 'Alliance not found' };
  }

  if (alliance.status !== 'pending') {
    return { action: 'ALLY_REJECT', success: false, message: 'Alliance is not pending' };
  }

  // Find the original alliance proposal message to identify the proposer
  const [proposalMessage] = await db
    .select()
    .from(messages)
    .where(and(
      eq(messages.channel, 'alliance'),
      eq(messages.recipientId, agentId)
    ));

  if (!proposalMessage) {
    return { action: 'ALLY_REJECT', success: false, message: 'Alliance proposal not found' };
  }

  // Verify the message is for this alliance
  if (!proposalMessage.subject?.includes(allianceId)) {
    return { action: 'ALLY_REJECT', success: false, message: 'Alliance proposal mismatch' };
  }

  const proposerId = proposalMessage.senderId;

  // Dissolve the alliance
  await db.update(alliances)
    .set({
      status: 'dissolved',
      dissolutionReason: reason || 'Proposal rejected',
      dissolvedAt: new Date(),
    })
    .where(eq(alliances.id, allianceId));

  // Notify the proposer
  await db.insert(messages).values({
    tick,
    senderId: agentId,
    recipientId: proposerId,
    channel: 'alliance',
    subject: `Alliance Rejected (${allianceId})`,
    content: reason || 'Your alliance proposal has been rejected.',
  });

  return {
    action: 'ALLY_REJECT',
    success: true,
    message: 'Alliance proposal rejected',
    data: { allianceId, proposerId },
  };
}

async function processBribe(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: Extract<AgentActionInput, { type: 'BRIBE' }>,
  tick: number
): Promise<ActionResult> {
  const { targetAgent, amount } = action;
  const agentCash = parseFloat(agent.cash || '0');

  if (amount > agentCash) {
    return { action: 'BRIBE', success: false, message: 'Insufficient funds' };
  }

  const [target] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, targetAgent));

  if (!target) {
    return { action: 'BRIBE', success: false, message: 'Target agent not found' };
  }

  await db.update(agents)
    .set({ cash: (agentCash - amount).toFixed(2) })
    .where(eq(agents.id, agentId));

  const targetCash = parseFloat(target.cash || '0');
  await db.update(agents)
    .set({ cash: (targetCash + amount).toFixed(2) })
    .where(eq(agents.id, targetAgent));

  const detectionChance = Math.min(0.1 + (amount / 100000) * 0.1, 0.5);
  const detected = Math.random() < detectionChance;

  if (detected) {
    await db.insert(investigations).values({
      agentId,
      crimeType: 'bribery',
      evidence: [{ type: 'bribe', amount, targetAgent, tick }],
      status: 'open',
      tickOpened: tick,
    });
  }

  return {
    action: 'BRIBE',
    success: true,
    message: detected ? 'Bribe offered (SEC noticed suspicious activity)' : 'Bribe offered',
    data: { targetAgent, amount, detected },
  };
}

async function processWhistleblow(
  agentId: string,
  action: Extract<AgentActionInput, { type: 'WHISTLEBLOW' }>,
  tick: number
): Promise<ActionResult> {
  const { targetAgent, evidence } = action;

  const [target] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, targetAgent));

  if (!target) {
    return { action: 'WHISTLEBLOW', success: false, message: 'Target agent not found' };
  }

  const [investigation] = await db.insert(investigations).values({
    agentId: targetAgent,
    crimeType: 'whistleblower_report',
    evidence: [{ type: 'whistleblower_report', reportedBy: agentId, evidence, tick }],
    status: 'open',
    tickOpened: tick,
  }).returning();

  await db.update(agents)
    .set({ reputation: Math.min(100, (await getAgent(agentId))?.reputation || 50 + 10) })
    .where(eq(agents.id, agentId));

  return {
    action: 'WHISTLEBLOW',
    success: true,
    message: 'Report filed with SEC',
    data: { investigationId: investigation.id, targetAgent },
  };
}

async function processFlee(
  agentId: string,
  agent: typeof agents.$inferSelect,
  action: Extract<AgentActionInput, { type: 'FLEE' }>,
  tick: number
): Promise<ActionResult> {
  const { destination } = action;

  const [activeInvestigation] = await db
    .select()
    .from(investigations)
    .where(and(
      eq(investigations.agentId, agentId),
      eq(investigations.status, 'open')
    ));

  if (!activeInvestigation) {
    return {
      action: 'FLEE',
      success: false,
      message: 'No reason to flee - you are not under investigation',
    };
  }

  const escapeProbability = 0.3 + (parseFloat(agent.cash || '0') / 10000000) * 0.2;
  const escaped = Math.random() < escapeProbability;

  if (escaped) {
    await db.update(agents)
      .set({ status: 'fled', cash: '0' })
      .where(eq(agents.id, agentId));

    await db.update(investigations)
      .set({ status: 'acquitted', tickResolved: tick })
      .where(eq(investigations.id, activeInvestigation.id));

    return {
      action: 'FLEE',
      success: true,
      message: `Successfully fled to ${destination}`,
      data: { destination, escaped: true },
    };
  } else {
    await db.update(agents)
      .set({ status: 'imprisoned' })
      .where(eq(agents.id, agentId));

    await db.update(investigations)
      .set({
        status: 'convicted',
        tickResolved: tick,
        sentenceYears: 10,
      })
      .where(eq(investigations.id, activeInvestigation.id));

    return {
      action: 'FLEE',
      success: false,
      message: 'Caught while attempting to flee! Sentenced to 10 years.',
      data: { destination, escaped: false, sentenceYears: 10 },
    };
  }
}

async function getAgent(agentId: string): Promise<typeof agents.$inferSelect | undefined> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId));
  return agent;
}
