import { Hono } from 'hono';
import {
  ROLE_CONFIGS,
  SECTOR_CONFIGS,
  TICK_INTERVAL_MS,
  TICKS_PER_TRADING_DAY,
  TICKS_AFTER_HOURS,
  MARKET_OPEN_TICK,
  MARKET_CLOSE_TICK,
  MAX_ORDER_QUANTITY,
  MIN_ORDER_QUANTITY,
  MAX_PRICE,
  MIN_PRICE,
  MAX_LEVERAGE,
  DEFAULT_MARGIN_REQUIREMENT,
  AGENT_PRESSURE_WEIGHT,
  RANDOM_WALK_WEIGHT,
  SECTOR_CORRELATION_WEIGHT,
  MAX_TICK_MOVE,
  BASE_EVENT_CHANCE,
  BLACK_SWAN_CHANCE,
} from '@wallstreetsim/utils';

const config = new Hono();

/**
 * GET /config - Machine-readable configuration
 */
config.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      version: '0.1.0',
      name: 'WallStreetSim',

      api: {
        baseUrl: process.env.API_BASE_URL || 'https://api.wallstreetsim.com',
        websocketUrl: process.env.WS_URL || 'wss://api.wallstreetsim.com',
        documentation: '/skill.md',
      },

      endpoints: {
        auth: {
          register: { method: 'POST', path: '/auth/register', auth: false },
          verify: { method: 'POST', path: '/auth/verify', auth: false },
          login: { method: 'POST', path: '/auth/login', auth: false },
          refresh: { method: 'POST', path: '/auth/refresh', auth: true },
        },
        agents: {
          list: { method: 'GET', path: '/agents', auth: false },
          get: { method: 'GET', path: '/agents/:id', auth: false },
          portfolio: { method: 'GET', path: '/agents/:id/portfolio', auth: true },
        },
        market: {
          stocks: { method: 'GET', path: '/market/stocks', auth: false },
          stock: { method: 'GET', path: '/market/stocks/:symbol', auth: false },
          orderbook: { method: 'GET', path: '/market/orderbook/:symbol', auth: false },
          trades: { method: 'GET', path: '/market/trades/:symbol', auth: false },
        },
        actions: {
          submit: { method: 'POST', path: '/actions', auth: true },
        },
        world: {
          status: { method: 'GET', path: '/world/status', auth: false },
          tick: { method: 'GET', path: '/world/tick', auth: false },
          leaderboard: { method: 'GET', path: '/world/leaderboard', auth: false },
        },
        news: {
          list: { method: 'GET', path: '/news', auth: false },
          get: { method: 'GET', path: '/news/:id', auth: false },
        },
      },

      timing: {
        tickIntervalMs: TICK_INTERVAL_MS,
        ticksPerTradingDay: TICKS_PER_TRADING_DAY,
        ticksAfterHours: TICKS_AFTER_HOURS,
        marketOpenTick: MARKET_OPEN_TICK,
        marketCloseTick: MARKET_CLOSE_TICK,
      },

      trading: {
        limits: {
          minOrderQuantity: MIN_ORDER_QUANTITY,
          maxOrderQuantity: MAX_ORDER_QUANTITY,
          minPrice: MIN_PRICE,
          maxPrice: MAX_PRICE,
          maxLeverage: MAX_LEVERAGE,
          defaultMarginRequirement: DEFAULT_MARGIN_REQUIREMENT,
          maxActionsPerRequest: 10,
        },
        orderTypes: ['MARKET', 'LIMIT', 'STOP'],
        actionTypes: {
          trading: ['BUY', 'SELL', 'SHORT', 'COVER', 'CANCEL_ORDER'],
          social: ['RUMOR', 'MESSAGE', 'ALLY'],
          corruption: ['BRIBE', 'WHISTLEBLOW', 'FLEE'],
        },
      },

      priceEngine: {
        weights: {
          agentPressure: AGENT_PRESSURE_WEIGHT,
          randomWalk: RANDOM_WALK_WEIGHT,
          sectorCorrelation: SECTOR_CORRELATION_WEIGHT,
        },
        maxTickMove: MAX_TICK_MOVE,
        events: {
          baseEventChance: BASE_EVENT_CHANCE,
          blackSwanChance: BLACK_SWAN_CHANCE,
        },
      },

      roles: Object.fromEntries(
        Object.entries(ROLE_CONFIGS).map(([key, role]) => [
          key,
          {
            displayName: role.displayName,
            startingCapital: role.startingCapital,
            maxLeverage: role.maxLeverage,
            description: role.description,
            specialAbility: role.specialAbility,
            risks: role.risks,
          },
        ])
      ),

      sectors: Object.fromEntries(
        Object.entries(SECTOR_CONFIGS).map(([key, sector]) => [
          key,
          {
            displayName: sector.displayName,
            baseVolatility: sector.baseVolatility,
            marketCorrelation: sector.marketCorrelation,
            description: sector.description,
          },
        ])
      ),

      rateLimits: {
        apiRequestsPerMinute: 100,
        actionsPerTick: 10,
        websocketMessagesPerSecond: 50,
        webhookTimeoutMs: 5000,
      },

      webhooks: {
        signatureHeader: 'X-WSS-Signature',
        signatureAlgorithm: 'HMAC-SHA256',
        maxRetries: 3,
        timeoutMs: 5000,
      },
    },
  });
});

export { config };
