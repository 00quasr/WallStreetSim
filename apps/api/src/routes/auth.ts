import { Hono } from 'hono';
import { db, agents } from '@wallstreetsim/db';
import { eq } from 'drizzle-orm';
import {
  RegisterAgentSchema,
  generateApiKey,
  hashApiKey,
  createSessionToken,
  verifySessionToken,
  ROLE_CONFIGS,
} from '@wallstreetsim/utils';
import type { AgentRole } from '@wallstreetsim/types';

const auth = new Hono();

/**
 * POST /auth/register - Register a new agent
 */
auth.post('/register', async (c) => {
  const body = await c.req.json();

  // Validate input
  const parsed = RegisterAgentSchema.safeParse(body);
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

  const { name, role, callbackUrl } = parsed.data;

  // Check if name is taken
  const [existing] = await db
    .select()
    .from(agents)
    .where(eq(agents.name, name));

  if (existing) {
    return c.json(
      {
        success: false,
        error: 'Agent name already taken',
      },
      409
    );
  }

  // Generate API key
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  // Get role config
  const roleConfig = ROLE_CONFIGS[role as AgentRole];

  // Create agent
  const [agent] = await db
    .insert(agents)
    .values({
      name,
      role,
      apiKeyHash,
      callbackUrl,
      cash: roleConfig.startingCapital.toString(),
      marginLimit: (roleConfig.startingCapital * roleConfig.maxLeverage).toString(),
      status: 'active',
      reputation: 50,
    })
    .returning();

  return c.json({
    success: true,
    data: {
      agentId: agent.id,
      apiKey, // Only returned once!
      role: agent.role,
      startingCapital: roleConfig.startingCapital,
    },
  });
});

/**
 * POST /auth/verify - Verify an API key
 */
auth.post('/verify', async (c) => {
  const body = await c.req.json();
  const { apiKey } = body;

  if (!apiKey) {
    return c.json(
      {
        success: false,
        error: 'API key required',
      },
      400
    );
  }

  const apiKeyHash = hashApiKey(apiKey);

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyHash, apiKeyHash));

  if (!agent) {
    return c.json({
      success: true,
      data: {
        valid: false,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      valid: true,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
    },
  });
});

/**
 * POST /auth/login - Exchange API key for session token
 */
auth.post('/login', async (c) => {
  const body = await c.req.json();
  const { apiKey } = body;

  if (!apiKey) {
    return c.json(
      {
        success: false,
        error: 'API key required',
      },
      400
    );
  }

  const apiKeyHash = hashApiKey(apiKey);

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyHash, apiKeyHash));

  if (!agent) {
    return c.json(
      {
        success: false,
        error: 'Invalid API key',
      },
      401
    );
  }

  if (agent.status !== 'active') {
    return c.json(
      {
        success: false,
        error: `Agent is ${agent.status}`,
      },
      403
    );
  }

  // Get JWT secret from environment
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return c.json(
      {
        success: false,
        error: 'Server configuration error',
      },
      500
    );
  }

  // Create session token (valid for 24 hours)
  const sessionToken = createSessionToken(
    agent.id,
    agent.name,
    agent.role,
    jwtSecret,
    86400
  );

  // Update last active timestamp
  await db
    .update(agents)
    .set({ lastActiveAt: new Date() })
    .where(eq(agents.id, agent.id));

  return c.json({
    success: true,
    data: {
      sessionToken,
      expiresIn: 86400,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
      },
    },
  });
});

/**
 * POST /auth/refresh - Refresh a session token
 */
auth.post('/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        success: false,
        error: 'Missing or invalid Authorization header',
      },
      401
    );
  }

  const token = authHeader.substring(7);

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return c.json(
      {
        success: false,
        error: 'Server configuration error',
      },
      500
    );
  }

  const payload = verifySessionToken(token, jwtSecret);
  if (!payload) {
    return c.json(
      {
        success: false,
        error: 'Invalid or expired session token',
      },
      401
    );
  }

  // Verify agent still exists and is active
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, payload.sub));

  if (!agent) {
    return c.json(
      {
        success: false,
        error: 'Agent not found',
      },
      404
    );
  }

  if (agent.status !== 'active') {
    return c.json(
      {
        success: false,
        error: `Agent is ${agent.status}`,
      },
      403
    );
  }

  // Create new session token
  const newSessionToken = createSessionToken(
    agent.id,
    agent.name,
    agent.role,
    jwtSecret,
    86400
  );

  // Update last active timestamp
  await db
    .update(agents)
    .set({ lastActiveAt: new Date() })
    .where(eq(agents.id, agent.id));

  return c.json({
    success: true,
    data: {
      sessionToken: newSessionToken,
      expiresIn: 86400,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
      },
    },
  });
});

export { auth };
