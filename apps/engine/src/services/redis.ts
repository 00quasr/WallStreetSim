import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl);
export const pubClient = new Redis(redisUrl);
export const subClient = new Redis(redisUrl);

// Channel names
export const CHANNELS = {
  TICK_UPDATES: 'channel:tick_updates',
  MARKET_UPDATES: 'channel:market',
  PRICE_UPDATES: 'channel:prices',
  NEWS_UPDATES: 'channel:news',
  LEADERBOARD_UPDATES: 'channel:leaderboard',
  TRADES: 'channel:trades',
  AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
  SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
};

// Key patterns
export const KEYS = {
  TICK_CURRENT: 'tick:current',
  TICK_PENDING_ACTIONS: 'tick:pending_actions',
  PRICE: (symbol: string) => `price:${symbol}`,
  PRICES_ALL: 'prices:all',
  VOLUME_24H: (symbol: string) => `volume:${symbol}:24h`,
  ORDERBOOK_BIDS: (symbol: string) => `orderbook:${symbol}:bids`,
  ORDERBOOK_ASKS: (symbol: string) => `orderbook:${symbol}:asks`,
  SESSION: (agentId: string) => `session:${agentId}`,
  RATE_LIMIT: (agentId: string, action: string) => `ratelimit:${agentId}:${action}`,
  LOCK: (resource: string) => `lock:${resource}`,
  LEADERBOARD: 'leaderboard:current',
};

/**
 * Publish a message to a channel
 */
export async function publish(channel: string, message: unknown): Promise<void> {
  await pubClient.publish(channel, JSON.stringify(message));
}

/**
 * Subscribe to a channel
 */
export async function subscribe(
  channel: string,
  callback: (message: unknown) => void
): Promise<void> {
  await subClient.subscribe(channel);
  subClient.on('message', (ch, msg) => {
    if (ch === channel) {
      callback(JSON.parse(msg));
    }
  });
}

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
  resource: string,
  ttlMs: number = 5000
): Promise<boolean> {
  const key = KEYS.LOCK(resource);
  const result = await redis.set(key, '1', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

/**
 * Release a distributed lock
 */
export async function releaseLock(resource: string): Promise<void> {
  await redis.del(KEYS.LOCK(resource));
}

/**
 * Get current tick from Redis
 */
export async function getCurrentTick(): Promise<number> {
  const tick = await redis.get(KEYS.TICK_CURRENT);
  return tick ? parseInt(tick, 10) : 0;
}

/**
 * Set current tick in Redis
 */
export async function setCurrentTick(tick: number): Promise<void> {
  await redis.set(KEYS.TICK_CURRENT, tick.toString());
}

/**
 * Cache price in Redis
 */
export async function cachePrice(symbol: string, price: number): Promise<void> {
  await redis.set(KEYS.PRICE(symbol), price.toString());
}

/**
 * Get cached price from Redis
 */
export async function getCachedPrice(symbol: string): Promise<number | null> {
  const price = await redis.get(KEYS.PRICE(symbol));
  return price ? parseFloat(price) : null;
}

/**
 * Increment rate limit counter
 */
export async function incrementRateLimit(
  agentId: string,
  action: string,
  windowSeconds: number = 60
): Promise<number> {
  const key = KEYS.RATE_LIMIT(agentId, action);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  return count;
}

/**
 * Check if rate limit exceeded
 */
export async function checkRateLimit(
  agentId: string,
  action: string,
  limit: number
): Promise<boolean> {
  const key = KEYS.RATE_LIMIT(agentId, action);
  const count = await redis.get(key);
  return count ? parseInt(count, 10) >= limit : false;
}

/**
 * Gracefully close Redis connections
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
  await pubClient.quit();
  await subClient.quit();
}
