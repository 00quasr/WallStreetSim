import { Hono } from 'hono';
import { db, agents, holdings } from '@wallstreetsim/db';
import { eq, desc } from 'drizzle-orm';
import { PaginationSchema, ROLE_CONFIGS } from '@wallstreetsim/utils';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import type { AgentRole } from '@wallstreetsim/types';

const agentsRouter = new Hono();

/**
 * GET /agents - List all agents
 */
agentsRouter.get('/', optionalAuthMiddleware, async (c) => {
  const query = c.req.query();
  const pagination = PaginationSchema.safeParse(query);

  const page = pagination.success ? pagination.data.page : 1;
  const pageSize = pagination.success ? pagination.data.pageSize : 20;
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      status: agents.status,
      reputation: agents.reputation,
      cash: agents.cash,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .orderBy(desc(agents.cash))
    .limit(pageSize)
    .offset(offset);

  // Calculate net worth (simplified - just cash for now)
  const agentList = rows.map((row, index) => ({
    rank: offset + index + 1,
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    reputation: row.reputation,
    netWorth: parseFloat(row.cash || '0'),
    createdAt: row.createdAt,
  }));

  return c.json({
    success: true,
    data: {
      items: agentList,
      page,
      pageSize,
      hasMore: rows.length === pageSize,
    },
  });
});

/**
 * GET /agents/:id - Get agent by ID
 */
agentsRouter.get('/:id', optionalAuthMiddleware, async (c) => {
  const { id } = c.req.param();
  const requestingAgentId = c.get('agentId');

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id));

  if (!agent) {
    return c.json(
      {
        success: false,
        error: 'Agent not found',
      },
      404
    );
  }

  // Full details if viewing own profile
  const isOwnProfile = requestingAgentId === id;
  const roleConfig = ROLE_CONFIGS[agent.role as AgentRole];

  const response: Record<string, unknown> = {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    roleDisplayName: roleConfig.displayName,
    status: agent.status,
    reputation: agent.reputation,
    netWorth: parseFloat(agent.cash || '0'),
    createdAt: agent.createdAt,
    lastActiveAt: agent.lastActiveAt,
  };

  if (isOwnProfile) {
    response.cash = parseFloat(agent.cash || '0');
    response.marginUsed = parseFloat(agent.marginUsed || '0');
    response.marginLimit = parseFloat(agent.marginLimit || '0');
    response.marginAvailable = parseFloat(agent.marginLimit || '0') - parseFloat(agent.marginUsed || '0');
    response.callbackUrl = agent.callbackUrl;
  }

  return c.json({
    success: true,
    data: response,
  });
});

/**
 * GET /agents/:id/portfolio - Get agent portfolio (requires auth for own)
 */
agentsRouter.get('/:id/portfolio', authMiddleware, async (c) => {
  const { id } = c.req.param();
  const requestingAgentId = c.get('agentId');

  // Can only view own portfolio
  if (requestingAgentId !== id) {
    return c.json(
      {
        success: false,
        error: 'Can only view your own portfolio',
      },
      403
    );
  }

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id));

  if (!agent) {
    return c.json(
      {
        success: false,
        error: 'Agent not found',
      },
      404
    );
  }

  const positions = await db
    .select()
    .from(holdings)
    .where(eq(holdings.agentId, id));

  const cash = parseFloat(agent.cash || '0');
  const marginUsed = parseFloat(agent.marginUsed || '0');
  const marginLimit = parseFloat(agent.marginLimit || '0');

  // Calculate portfolio value (simplified)
  const portfolioValue = positions.reduce((sum, pos) => {
    return sum + pos.quantity * parseFloat(pos.averageCost);
  }, 0);

  return c.json({
    success: true,
    data: {
      agentId: id,
      cash,
      marginUsed,
      marginAvailable: marginLimit - marginUsed,
      portfolioValue,
      netWorth: cash + portfolioValue,
      positions: positions.map(pos => ({
        symbol: pos.symbol,
        quantity: pos.quantity,
        averageCost: parseFloat(pos.averageCost),
      })),
    },
  });
});

export { agentsRouter };
