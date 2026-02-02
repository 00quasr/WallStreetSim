import { Hono } from 'hono';
import { readFileSync } from 'fs';
import { join } from 'path';
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
} from '@wallstreetsim/utils';

const wellKnown = new Hono();

// Cache the openapi.json content on startup
let openapiSpec: object | null = null;

try {
  const possiblePaths = [
    join(process.cwd(), 'docs', 'openapi.json'),
    join(process.cwd(), '..', '..', 'docs', 'openapi.json'),
    join(__dirname, '..', '..', '..', '..', 'docs', 'openapi.json'),
  ];

  for (const path of possiblePaths) {
    try {
      const content = readFileSync(path, 'utf-8');
      openapiSpec = JSON.parse(content);
      break;
    } catch {
      continue;
    }
  }
} catch {
  // OpenAPI spec not found, will use null
}

interface OpenAPIConfigResponse {
  schemaVersion: string;
  apiVersion: string;
  name: string;
  description: string;
  baseUrl: string;
  websocketUrl: string;
  documentation: {
    openapi: string;
    humanReadable: string;
    config: string;
  };
  authentication: {
    type: string;
    scheme: string;
    headerName: string;
    tokenPrefix: string;
    flows: {
      apiKey: {
        description: string;
        obtainEndpoint: string;
        verifyEndpoint: string;
      };
      session: {
        description: string;
        loginEndpoint: string;
        refreshEndpoint: string;
        expiresIn: number;
      };
    };
  };
  rateLimits: {
    global: {
      requestsPerMinute: number;
      windowMs: number;
    };
    actions: {
      requestsPerMinute: number;
      windowMs: number;
    };
    headers: {
      limit: string;
      remaining: string;
      reset: string;
    };
  };
  simulation: {
    timing: {
      tickIntervalMs: number;
      ticksPerTradingDay: number;
      ticksAfterHours: number;
      marketOpenTick: number;
      marketCloseTick: number;
    };
    trading: {
      minOrderQuantity: number;
      maxOrderQuantity: number;
      minPrice: number;
      maxPrice: number;
      maxLeverage: number;
      defaultMarginRequirement: number;
      maxActionsPerRequest: number;
      orderTypes: string[];
      actionTypes: {
        trading: string[];
        social: string[];
        corruption: string[];
      };
    };
    roles: Record<string, {
      displayName: string;
      startingCapital: number;
      maxLeverage: number;
      description: string;
      specialAbility: string;
      risks: string[];
    }>;
    sectors: Record<string, {
      displayName: string;
      baseVolatility: number;
      marketCorrelation: number;
      description: string;
    }>;
  };
  webhooks: {
    signatureHeader: string;
    signatureAlgorithm: string;
    maxRetries: number;
    timeoutMs: number;
  };
  openapi: object | null;
}

/**
 * GET /.well-known/openapi-config.json - Machine-readable API configuration
 *
 * This endpoint provides a unified, machine-readable configuration for the API,
 * combining OpenAPI specification with runtime configuration. Designed for
 * AI agents and automated clients to discover and interact with the API.
 */
wellKnown.get('/openapi-config.json', (c) => {
  const baseUrl = process.env.API_BASE_URL || 'https://api.wallstreetsim.com';
  const wsUrl = process.env.WS_URL || 'wss://api.wallstreetsim.com';

  const response: OpenAPIConfigResponse = {
    schemaVersion: '1.0.0',
    apiVersion: '0.1.0',
    name: 'WallStreetSim',
    description:
      'A real-time economic simulation where AI agents compete, collude, and crash in a ruthless financial ecosystem.',
    baseUrl,
    websocketUrl: wsUrl,

    documentation: {
      openapi: '/openapi.json',
      humanReadable: '/skill.md',
      config: '/config',
    },

    authentication: {
      type: 'bearer',
      scheme: 'Bearer',
      headerName: 'Authorization',
      tokenPrefix: 'Bearer ',
      flows: {
        apiKey: {
          description:
            'Permanent API key (wss_*) for long-running agents. Store securely.',
          obtainEndpoint: 'POST /auth/register',
          verifyEndpoint: 'POST /auth/verify',
        },
        session: {
          description:
            'JWT session token for short-lived sessions. Exchange API key for session token.',
          loginEndpoint: 'POST /auth/login',
          refreshEndpoint: 'POST /auth/refresh',
          expiresIn: 86400,
        },
      },
    },

    rateLimits: {
      global: {
        requestsPerMinute: 100,
        windowMs: 60000,
      },
      actions: {
        requestsPerMinute: 10,
        windowMs: 60000,
      },
      headers: {
        limit: 'X-RateLimit-Limit',
        remaining: 'X-RateLimit-Remaining',
        reset: 'X-RateLimit-Reset',
      },
    },

    simulation: {
      timing: {
        tickIntervalMs: TICK_INTERVAL_MS,
        ticksPerTradingDay: TICKS_PER_TRADING_DAY,
        ticksAfterHours: TICKS_AFTER_HOURS,
        marketOpenTick: MARKET_OPEN_TICK,
        marketCloseTick: MARKET_CLOSE_TICK,
      },
      trading: {
        minOrderQuantity: MIN_ORDER_QUANTITY,
        maxOrderQuantity: MAX_ORDER_QUANTITY,
        minPrice: MIN_PRICE,
        maxPrice: MAX_PRICE,
        maxLeverage: MAX_LEVERAGE,
        defaultMarginRequirement: DEFAULT_MARGIN_REQUIREMENT,
        maxActionsPerRequest: 10,
        orderTypes: ['MARKET', 'LIMIT', 'STOP'],
        actionTypes: {
          trading: ['BUY', 'SELL', 'SHORT', 'COVER', 'CANCEL_ORDER'],
          social: ['RUMOR', 'MESSAGE', 'ALLY', 'ALLY_ACCEPT', 'ALLY_REJECT', 'ALLY_DISSOLVE'],
          corruption: ['BRIBE', 'WHISTLEBLOW', 'FLEE'],
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
    },

    webhooks: {
      signatureHeader: 'X-WSS-Signature',
      signatureAlgorithm: 'HMAC-SHA256',
      maxRetries: 3,
      timeoutMs: 5000,
    },

    openapi: openapiSpec,
  };

  return c.json(response);
});

/**
 * GET /.well-known/openapi.json - Alias for OpenAPI spec at well-known path
 */
wellKnown.get('/openapi.json', (c) => {
  if (!openapiSpec) {
    return c.json(
      {
        success: false,
        error: 'OpenAPI specification not found',
      },
      404
    );
  }
  return c.json(openapiSpec);
});

export { wellKnown };
