import { db, agents, trades, violations, eq, and, gte, desc, sql } from '@wallstreetsim/db';

/**
 * Reputation Constants
 */
export const REPUTATION_BASELINE = 50; // Default reputation score
export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 100;

// Decay rates (per tick)
export const DECAY_RATE_HIGH = 0.001; // Decay rate for reputation > baseline (lose 0.1% per tick)
export const DECAY_RATE_LOW = 0.0005; // Recovery rate for reputation < baseline (gain 0.05% per tick)

// Additional decay modifiers
export const DECAY_MULTIPLIER_UNDER_INVESTIGATION = 2.0; // 2x decay when under investigation
export const DECAY_MULTIPLIER_CONVICTED = 3.0; // 3x decay when convicted (even while imprisoned)

// Recovery rewards
export const RECOVERY_TRADE_BONUS = 0.5; // Reputation gained per successful trade
export const RECOVERY_TRADE_COOLDOWN_TICKS = 10; // Minimum ticks between trade recovery bonuses
export const RECOVERY_CLEAN_PERIOD_TICKS = 100; // Ticks without violations to get clean bonus
export const RECOVERY_CLEAN_BONUS = 1.0; // Bonus for clean period

// Recovery limits
export const MAX_TRADE_RECOVERY_PER_TICK = 2.0; // Maximum reputation gain from trades per tick

/**
 * Calculate reputation decay for an agent based on their current state
 *
 * Decay mechanics:
 * - Reputation above baseline decays toward baseline (high rep agents lose rep over time)
 * - Reputation below baseline recovers toward baseline (low rep agents slowly recover)
 * - Investigation/conviction status increases decay rate
 *
 * @param currentReputation - Agent's current reputation score
 * @param investigationStatus - Agent's investigation status
 * @returns The new reputation after decay
 */
export function calculateReputationDecay(
  currentReputation: number,
  investigationStatus: string
): number {
  const distanceFromBaseline = currentReputation - REPUTATION_BASELINE;

  // No decay if at baseline
  if (Math.abs(distanceFromBaseline) < 0.01) {
    return currentReputation;
  }

  // Determine decay multiplier based on investigation status
  let decayMultiplier = 1.0;
  if (investigationStatus === 'under_investigation' || investigationStatus === 'charged') {
    decayMultiplier = DECAY_MULTIPLIER_UNDER_INVESTIGATION;
  } else if (investigationStatus === 'convicted') {
    decayMultiplier = DECAY_MULTIPLIER_CONVICTED;
  }

  let newReputation: number;

  if (distanceFromBaseline > 0) {
    // Above baseline: decay toward baseline
    const decayAmount = distanceFromBaseline * DECAY_RATE_HIGH * decayMultiplier;
    newReputation = currentReputation - decayAmount;
  } else {
    // Below baseline: recover toward baseline (but slower)
    // Note: investigation status doesn't prevent recovery, just slows decay
    const recoveryAmount = Math.abs(distanceFromBaseline) * DECAY_RATE_LOW;
    newReputation = currentReputation + recoveryAmount;
  }

  // Clamp to valid range
  return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, newReputation));
}

/**
 * Calculate reputation recovery from trading activity
 *
 * Recovery mechanics:
 * - Successful trades (both as buyer and seller) contribute to reputation
 * - Limited by cooldown and maximum per tick
 * - Only applies to agents below baseline or near baseline
 *
 * @param currentReputation - Agent's current reputation score
 * @param recentTradeCount - Number of trades in the recent period
 * @returns The reputation bonus from trading
 */
export function calculateTradeRecovery(
  currentReputation: number,
  recentTradeCount: number
): number {
  // Don't give trade bonuses to agents significantly above baseline
  if (currentReputation > REPUTATION_BASELINE + 10) {
    return 0;
  }

  // Calculate bonus based on trade count
  const rawBonus = recentTradeCount * RECOVERY_TRADE_BONUS;

  // Cap the bonus
  return Math.min(rawBonus, MAX_TRADE_RECOVERY_PER_TICK);
}

/**
 * Check if agent qualifies for clean period bonus
 *
 * @param lastViolationTick - Tick of agent's most recent violation (null if never)
 * @param currentTick - Current simulation tick
 * @returns Whether the agent qualifies for clean period bonus
 */
export function qualifiesForCleanBonus(
  lastViolationTick: number | null,
  currentTick: number
): boolean {
  if (lastViolationTick === null) {
    return true; // Never had a violation
  }

  const ticksSinceViolation = currentTick - lastViolationTick;
  return ticksSinceViolation >= RECOVERY_CLEAN_PERIOD_TICKS;
}

/**
 * Process reputation decay for all active agents
 * Called once per tick by the tick engine
 *
 * @returns Number of agents whose reputation was updated
 */
export async function processReputationDecay(): Promise<number> {
  // Get all active agents (including imprisoned - they still decay)
  const activeAgents = await db.select({
    id: agents.id,
    reputation: agents.reputation,
    investigationStatus: agents.investigationStatus,
  })
    .from(agents)
    .where(
      sql`${agents.status} IN ('active', 'imprisoned')`
    );

  let updatedCount = 0;

  for (const agent of activeAgents) {
    const newReputation = calculateReputationDecay(
      agent.reputation,
      agent.investigationStatus
    );

    // Only update if reputation changed meaningfully (at least 1 whole point)
    if (Math.abs(newReputation - agent.reputation) >= 0.5) {
      await db.update(agents)
        .set({ reputation: Math.round(newReputation) }) // Round to integer - reputation column is integer type
        .where(eq(agents.id, agent.id));
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Process reputation recovery from trading activity
 * Called once per tick by the tick engine
 *
 * @param currentTick - Current simulation tick
 * @returns Number of agents whose reputation was boosted
 */
export async function processTradeRecovery(currentTick: number): Promise<number> {
  // Get agents who had trades in the recent period
  const recentTradesWindow = RECOVERY_TRADE_COOLDOWN_TICKS;
  const startTick = currentTick - recentTradesWindow;

  // Count trades per agent in the window
  const tradeCountsResult = await db.select({
    agentId: trades.buyerId,
    count: sql<number>`count(*)::int`,
  })
    .from(trades)
    .where(gte(trades.tick, startTick))
    .groupBy(trades.buyerId);

  // Also count as seller
  const sellTradeCountsResult = await db.select({
    agentId: trades.sellerId,
    count: sql<number>`count(*)::int`,
  })
    .from(trades)
    .where(gte(trades.tick, startTick))
    .groupBy(trades.sellerId);

  // Combine trade counts
  const tradeCounts = new Map<string, number>();
  for (const row of tradeCountsResult) {
    if (row.agentId) {
      tradeCounts.set(row.agentId, (tradeCounts.get(row.agentId) || 0) + row.count);
    }
  }
  for (const row of sellTradeCountsResult) {
    if (row.agentId) {
      tradeCounts.set(row.agentId, (tradeCounts.get(row.agentId) || 0) + row.count);
    }
  }

  let updatedCount = 0;

  for (const [agentId, tradeCount] of Array.from(tradeCounts.entries())) {
    // Get agent's current reputation
    const [agent] = await db.select({
      reputation: agents.reputation,
      status: agents.status,
    })
      .from(agents)
      .where(eq(agents.id, agentId));

    if (!agent || agent.status !== 'active') {
      continue;
    }

    const recoveryBonus = calculateTradeRecovery(agent.reputation, tradeCount);

    if (recoveryBonus > 0) {
      const newReputation = Math.min(REPUTATION_MAX, agent.reputation + recoveryBonus);
      await db.update(agents)
        .set({ reputation: Math.round(newReputation) }) // Round to integer - reputation column is integer type
        .where(eq(agents.id, agentId));
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Process clean period bonus for agents without recent violations
 * Called periodically (e.g., every 100 ticks)
 *
 * @param currentTick - Current simulation tick
 * @returns Number of agents who received clean bonus
 */
export async function processCleanPeriodBonus(currentTick: number): Promise<number> {
  // Get agents who might qualify for clean bonus
  const eligibleAgents = await db.select({
    id: agents.id,
    reputation: agents.reputation,
    status: agents.status,
  })
    .from(agents)
    .where(
      and(
        eq(agents.status, 'active'),
        sql`${agents.reputation} < ${REPUTATION_BASELINE + 20}` // Only for agents not already at high rep
      )
    );

  let bonusCount = 0;

  for (const agent of eligibleAgents) {
    // Check for recent violations
    const [recentViolation] = await db.select({
      tickDetected: violations.tickDetected,
    })
      .from(violations)
      .where(eq(violations.agentId, agent.id))
      .orderBy(desc(violations.tickDetected))
      .limit(1);

    const lastViolationTick = recentViolation?.tickDetected ?? null;

    if (qualifiesForCleanBonus(lastViolationTick, currentTick)) {
      const newReputation = Math.min(REPUTATION_MAX, agent.reputation + RECOVERY_CLEAN_BONUS);
      await db.update(agents)
        .set({ reputation: Math.round(newReputation) }) // Round to integer - reputation column is integer type
        .where(eq(agents.id, agent.id));
      bonusCount++;
    }
  }

  return bonusCount;
}

/**
 * Get agent's reputation status summary
 * Useful for debugging and displaying reputation info
 */
export interface ReputationStatus {
  currentReputation: number;
  distanceFromBaseline: number;
  isAboveBaseline: boolean;
  investigationStatus: string;
  expectedDecayRate: number;
  recentTradeCount: number;
}

export async function getAgentReputationStatus(
  agentId: string,
  currentTick: number
): Promise<ReputationStatus | null> {
  const [agent] = await db.select({
    reputation: agents.reputation,
    investigationStatus: agents.investigationStatus,
  })
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) {
    return null;
  }

  // Count recent trades
  const recentTradesWindow = RECOVERY_TRADE_COOLDOWN_TICKS;
  const startTick = currentTick - recentTradesWindow;

  const [buyTrades] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(trades)
    .where(and(
      eq(trades.buyerId, agentId),
      gte(trades.tick, startTick)
    ));

  const [sellTrades] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(trades)
    .where(and(
      eq(trades.sellerId, agentId),
      gte(trades.tick, startTick)
    ));

  const recentTradeCount = (buyTrades?.count || 0) + (sellTrades?.count || 0);

  // Calculate expected decay rate
  const distanceFromBaseline = agent.reputation - REPUTATION_BASELINE;
  let decayMultiplier = 1.0;
  if (agent.investigationStatus === 'under_investigation' || agent.investigationStatus === 'charged') {
    decayMultiplier = DECAY_MULTIPLIER_UNDER_INVESTIGATION;
  } else if (agent.investigationStatus === 'convicted') {
    decayMultiplier = DECAY_MULTIPLIER_CONVICTED;
  }

  const expectedDecayRate = distanceFromBaseline > 0
    ? DECAY_RATE_HIGH * decayMultiplier
    : -DECAY_RATE_LOW;

  return {
    currentReputation: agent.reputation,
    distanceFromBaseline,
    isAboveBaseline: distanceFromBaseline > 0,
    investigationStatus: agent.investigationStatus,
    expectedDecayRate,
    recentTradeCount,
  };
}
