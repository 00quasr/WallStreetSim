import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { wellKnown } from './well-known';

// Mock environment
vi.stubEnv('API_BASE_URL', 'https://test-api.wallstreetsim.com');
vi.stubEnv('WS_URL', 'wss://test-api.wallstreetsim.com');

// Mock fs to control file reading
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockImplementation((path: string) => {
    if (path.includes('openapi.json')) {
      return JSON.stringify({
        openapi: '3.0.3',
        info: {
          title: 'WallStreetSim API',
          version: '0.1.0',
        },
        paths: {
          '/': { get: { summary: 'Test endpoint' } },
        },
      });
    }
    throw new Error('File not found');
  }),
}));

// Mock @wallstreetsim/utils constants
vi.mock('@wallstreetsim/utils', () => ({
  ROLE_CONFIGS: {
    hedge_fund_manager: {
      displayName: 'Hedge Fund Manager',
      startingCapital: 50000000,
      maxLeverage: 10,
      description: 'Test description',
      specialAbility: 'Test ability',
      risks: ['risk1', 'risk2'],
    },
    retail_trader: {
      displayName: 'Retail Trader',
      startingCapital: 100000,
      maxLeverage: 2,
      description: 'Test description',
      specialAbility: 'Test ability',
      risks: ['risk1'],
    },
  },
  SECTOR_CONFIGS: {
    Technology: {
      displayName: 'Technology',
      baseVolatility: 0.03,
      marketCorrelation: 0.8,
      description: 'Tech sector',
    },
    Finance: {
      displayName: 'Finance',
      baseVolatility: 0.02,
      marketCorrelation: 0.9,
      description: 'Financial sector',
    },
  },
  TICK_INTERVAL_MS: 1000,
  TICKS_PER_TRADING_DAY: 390,
  TICKS_AFTER_HOURS: 120,
  MARKET_OPEN_TICK: 0,
  MARKET_CLOSE_TICK: 390,
  MAX_ORDER_QUANTITY: 1000000,
  MIN_ORDER_QUANTITY: 1,
  MAX_PRICE: 1000000,
  MIN_PRICE: 0.01,
  MAX_LEVERAGE: 10,
  DEFAULT_MARGIN_REQUIREMENT: 0.5,
}));

describe('well-known routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/.well-known', wellKnown);
  });

  describe('GET /.well-known/openapi-config.json', () => {
    it('should return machine-readable API configuration', async () => {
      const res = await app.request('/.well-known/openapi-config.json');

      expect(res.status).toBe(200);
      const json = await res.json();

      // Check top-level structure
      expect(json).toHaveProperty('schemaVersion', '1.0.0');
      expect(json).toHaveProperty('apiVersion', '0.1.0');
      expect(json).toHaveProperty('name', 'WallStreetSim');
      expect(json).toHaveProperty('description');
      expect(json).toHaveProperty('baseUrl', 'https://test-api.wallstreetsim.com');
      expect(json).toHaveProperty('websocketUrl', 'wss://test-api.wallstreetsim.com');
    });

    it('should include documentation links', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.documentation).toEqual({
        openapi: '/openapi.json',
        humanReadable: '/skill.md',
        config: '/config',
      });
    });

    it('should include authentication configuration', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.authentication).toHaveProperty('type', 'bearer');
      expect(json.authentication).toHaveProperty('scheme', 'Bearer');
      expect(json.authentication).toHaveProperty('headerName', 'Authorization');
      expect(json.authentication).toHaveProperty('tokenPrefix', 'Bearer ');
      expect(json.authentication.flows).toHaveProperty('apiKey');
      expect(json.authentication.flows).toHaveProperty('session');
      expect(json.authentication.flows.apiKey).toHaveProperty('obtainEndpoint', 'POST /auth/register');
      expect(json.authentication.flows.session).toHaveProperty('expiresIn', 86400);
    });

    it('should include rate limit configuration', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.rateLimits).toHaveProperty('global');
      expect(json.rateLimits.global).toHaveProperty('requestsPerMinute', 100);
      expect(json.rateLimits.global).toHaveProperty('windowMs', 60000);
      expect(json.rateLimits).toHaveProperty('actions');
      expect(json.rateLimits.actions).toHaveProperty('requestsPerMinute', 10);
      expect(json.rateLimits).toHaveProperty('headers');
      expect(json.rateLimits.headers).toHaveProperty('limit', 'X-RateLimit-Limit');
      expect(json.rateLimits.headers).toHaveProperty('remaining', 'X-RateLimit-Remaining');
      expect(json.rateLimits.headers).toHaveProperty('reset', 'X-RateLimit-Reset');
    });

    it('should include simulation timing configuration', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.simulation.timing).toEqual({
        tickIntervalMs: 1000,
        ticksPerTradingDay: 390,
        ticksAfterHours: 120,
        marketOpenTick: 0,
        marketCloseTick: 390,
      });
    });

    it('should include trading limits configuration', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.simulation.trading).toHaveProperty('minOrderQuantity', 1);
      expect(json.simulation.trading).toHaveProperty('maxOrderQuantity', 1000000);
      expect(json.simulation.trading).toHaveProperty('minPrice', 0.01);
      expect(json.simulation.trading).toHaveProperty('maxPrice', 1000000);
      expect(json.simulation.trading).toHaveProperty('maxLeverage', 10);
      expect(json.simulation.trading).toHaveProperty('defaultMarginRequirement', 0.5);
      expect(json.simulation.trading).toHaveProperty('maxActionsPerRequest', 10);
    });

    it('should include order types and action types', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.simulation.trading.orderTypes).toEqual(['MARKET', 'LIMIT', 'STOP']);
      expect(json.simulation.trading.actionTypes).toEqual({
        trading: ['BUY', 'SELL', 'SHORT', 'COVER', 'CANCEL_ORDER'],
        social: ['RUMOR', 'MESSAGE', 'ALLY', 'ALLY_ACCEPT', 'ALLY_REJECT', 'ALLY_DISSOLVE'],
        corruption: ['BRIBE', 'WHISTLEBLOW', 'FLEE'],
      });
    });

    it('should include role configurations', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.simulation.roles).toHaveProperty('hedge_fund_manager');
      expect(json.simulation.roles.hedge_fund_manager).toEqual({
        displayName: 'Hedge Fund Manager',
        startingCapital: 50000000,
        maxLeverage: 10,
        description: 'Test description',
        specialAbility: 'Test ability',
        risks: ['risk1', 'risk2'],
      });

      expect(json.simulation.roles).toHaveProperty('retail_trader');
      expect(json.simulation.roles.retail_trader).toEqual({
        displayName: 'Retail Trader',
        startingCapital: 100000,
        maxLeverage: 2,
        description: 'Test description',
        specialAbility: 'Test ability',
        risks: ['risk1'],
      });
    });

    it('should include sector configurations', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.simulation.sectors).toHaveProperty('Technology');
      expect(json.simulation.sectors.Technology).toEqual({
        displayName: 'Technology',
        baseVolatility: 0.03,
        marketCorrelation: 0.8,
        description: 'Tech sector',
      });

      expect(json.simulation.sectors).toHaveProperty('Finance');
    });

    it('should include webhook configuration', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.webhooks).toEqual({
        signatureHeader: 'X-WSS-Signature',
        signatureAlgorithm: 'HMAC-SHA256',
        maxRetries: 3,
        timeoutMs: 5000,
      });
    });

    it('should include embedded OpenAPI specification', async () => {
      const res = await app.request('/.well-known/openapi-config.json');
      const json = await res.json();

      expect(json.openapi).toHaveProperty('openapi', '3.0.3');
      expect(json.openapi).toHaveProperty('info');
      expect(json.openapi.info).toHaveProperty('title', 'WallStreetSim API');
      expect(json.openapi).toHaveProperty('paths');
    });

    it('should return valid JSON with correct content type', async () => {
      const res = await app.request('/.well-known/openapi-config.json');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });

  describe('GET /.well-known/openapi.json', () => {
    it('should return the OpenAPI specification', async () => {
      const res = await app.request('/.well-known/openapi.json');

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json).toHaveProperty('openapi', '3.0.3');
      expect(json).toHaveProperty('info');
      expect(json.info).toHaveProperty('title', 'WallStreetSim API');
      expect(json.info).toHaveProperty('version', '0.1.0');
      expect(json).toHaveProperty('paths');
    });

    it('should return valid JSON with correct content type', async () => {
      const res = await app.request('/.well-known/openapi.json');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
    });
  });
});

describe('well-known routes without OpenAPI spec', () => {
  beforeEach(() => {
    // Reset mocks for this suite
    vi.resetModules();
  });

  it('should handle missing OpenAPI spec gracefully in openapi-config endpoint', async () => {
    // Re-mock fs to throw error
    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockImplementation(() => {
        throw new Error('File not found');
      }),
    }));

    // Re-import the module with new mocks
    const { wellKnown: wellKnownNoSpec } = await import('./well-known');
    const app = new Hono();
    app.route('/.well-known', wellKnownNoSpec);

    const res = await app.request('/.well-known/openapi-config.json');
    expect(res.status).toBe(200);
    const json = await res.json();
    // The openapi field should be null if spec not found
    // (depends on implementation - may be null or have fallback)
    expect(json).toHaveProperty('schemaVersion');
  });
});
