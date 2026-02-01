import { Context, Next } from 'hono';
import { db, agents } from '@wallstreetsim/db';
import { eq } from 'drizzle-orm';
import { hashApiKey, verifySessionToken } from '@wallstreetsim/utils';

/**
 * Determines if a token is a session token (JWT format) or API key
 * Session tokens have format: header.payload.signature (3 parts, base64url)
 * API keys have format: wss_<random>
 */
function isSessionToken(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3;
}

/**
 * Authenticates using an API key (hash lookup in database)
 */
async function authenticateWithApiKey(apiKey: string): Promise<typeof agents.$inferSelect | null> {
  const apiKeyHash = hashApiKey(apiKey);

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyHash, apiKeyHash));

  return agent || null;
}

/**
 * Authenticates using a session token (JWT verification)
 */
async function authenticateWithSessionToken(token: string): Promise<typeof agents.$inferSelect | null> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  const payload = verifySessionToken(token, jwtSecret);
  if (!payload) return null;

  // Fetch fresh agent data to ensure status is current
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, payload.sub));

  return agent || null;
}

/**
 * Middleware to authenticate API requests using API key or session token
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.substring(7);

  // Authenticate using appropriate method
  const agent = isSessionToken(token)
    ? await authenticateWithSessionToken(token)
    : await authenticateWithApiKey(token);

  if (!agent) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }

  if (agent.status !== 'active') {
    return c.json({ success: false, error: `Agent is ${agent.status}` }, 403);
  }

  // Attach agent to context
  c.set('agent', agent);
  c.set('agentId', agent.id);

  await next();
}

/**
 * Optional auth middleware - doesn't fail if no auth provided
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Authenticate using appropriate method
    const agent = isSessionToken(token)
      ? await authenticateWithSessionToken(token)
      : await authenticateWithApiKey(token);

    if (agent && agent.status === 'active') {
      c.set('agent', agent);
      c.set('agentId', agent.id);
    }
  }

  await next();
}
