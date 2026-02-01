import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { config } from './config';

// Mock environment
vi.stubEnv('API_BASE_URL', 'https://api.wallstreetsim.com');
vi.stubEnv('WS_URL', 'wss://api.wallstreetsim.com');

describe('Config Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/config', config);
  });

  describe('GET /config', () => {
    it('should return machine-readable configuration', async () => {
      const res = await app.request('/config');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('should include API version and name', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.version).toBe('0.1.0');
      expect(body.data.name).toBe('WallStreetSim');
    });

    it('should include API endpoint information', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.api).toBeDefined();
      expect(body.data.api.baseUrl).toBeDefined();
      expect(body.data.api.websocketUrl).toBeDefined();
      expect(body.data.api.documentation).toBe('/skill.md');
    });

    it('should include all endpoint definitions', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.endpoints).toBeDefined();
      expect(body.data.endpoints.auth).toBeDefined();
      expect(body.data.endpoints.agents).toBeDefined();
      expect(body.data.endpoints.market).toBeDefined();
      expect(body.data.endpoints.actions).toBeDefined();
      expect(body.data.endpoints.world).toBeDefined();
      expect(body.data.endpoints.news).toBeDefined();
    });

    it('should include auth endpoint details', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      const authEndpoints = body.data.endpoints.auth;
      expect(authEndpoints.register).toEqual({
        method: 'POST',
        path: '/auth/register',
        auth: false,
      });
      expect(authEndpoints.login).toEqual({
        method: 'POST',
        path: '/auth/login',
        auth: false,
      });
      expect(authEndpoints.refresh).toEqual({
        method: 'POST',
        path: '/auth/refresh',
        auth: true,
      });
    });

    it('should include timing configuration', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.timing).toBeDefined();
      expect(body.data.timing.tickIntervalMs).toBe(1000);
      expect(body.data.timing.ticksPerTradingDay).toBe(390);
      expect(body.data.timing.ticksAfterHours).toBe(240);
      expect(body.data.timing.marketOpenTick).toBe(0);
      expect(body.data.timing.marketCloseTick).toBe(390);
    });

    it('should include trading limits', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.trading).toBeDefined();
      expect(body.data.trading.limits).toBeDefined();
      expect(body.data.trading.limits.minOrderQuantity).toBe(1);
      expect(body.data.trading.limits.maxOrderQuantity).toBe(1_000_000);
      expect(body.data.trading.limits.minPrice).toBe(0.01);
      expect(body.data.trading.limits.maxPrice).toBe(1_000_000);
      expect(body.data.trading.limits.maxLeverage).toBe(10);
      expect(body.data.trading.limits.defaultMarginRequirement).toBe(0.25);
      expect(body.data.trading.limits.maxActionsPerRequest).toBe(10);
    });

    it('should include order and action types', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.trading.orderTypes).toEqual(['MARKET', 'LIMIT', 'STOP']);
      expect(body.data.trading.actionTypes.trading).toEqual([
        'BUY',
        'SELL',
        'SHORT',
        'COVER',
        'CANCEL_ORDER',
      ]);
      expect(body.data.trading.actionTypes.social).toEqual([
        'RUMOR',
        'MESSAGE',
        'ALLY',
      ]);
      expect(body.data.trading.actionTypes.corruption).toEqual([
        'BRIBE',
        'WHISTLEBLOW',
        'FLEE',
      ]);
    });

    it('should include price engine configuration', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.priceEngine).toBeDefined();
      expect(body.data.priceEngine.weights).toBeDefined();
      expect(body.data.priceEngine.weights.agentPressure).toBe(0.6);
      expect(body.data.priceEngine.weights.randomWalk).toBe(0.3);
      expect(body.data.priceEngine.weights.sectorCorrelation).toBe(0.1);
      expect(body.data.priceEngine.maxTickMove).toBe(0.1);
      expect(body.data.priceEngine.events).toBeDefined();
      expect(body.data.priceEngine.events.baseEventChance).toBe(0.02);
      expect(body.data.priceEngine.events.blackSwanChance).toBe(0.001);
    });

    it('should include all 9 agent roles', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.roles).toBeDefined();
      const roleKeys = Object.keys(body.data.roles);
      expect(roleKeys).toHaveLength(9);
      expect(roleKeys).toContain('hedge_fund_manager');
      expect(roleKeys).toContain('retail_trader');
      expect(roleKeys).toContain('ceo');
      expect(roleKeys).toContain('investment_banker');
      expect(roleKeys).toContain('financial_journalist');
      expect(roleKeys).toContain('sec_investigator');
      expect(roleKeys).toContain('whistleblower');
      expect(roleKeys).toContain('quant');
      expect(roleKeys).toContain('influencer');
    });

    it('should include correct role details', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      const hedgeFund = body.data.roles.hedge_fund_manager;
      expect(hedgeFund.displayName).toBe('Hedge Fund Manager');
      expect(hedgeFund.startingCapital).toBe(100_000_000);
      expect(hedgeFund.maxLeverage).toBe(10);
      expect(hedgeFund.description).toBeDefined();
      expect(hedgeFund.specialAbility).toBeDefined();
      expect(hedgeFund.risks).toBeInstanceOf(Array);

      const retailTrader = body.data.roles.retail_trader;
      expect(retailTrader.startingCapital).toBe(10_000);
      expect(retailTrader.maxLeverage).toBe(2);

      const quant = body.data.roles.quant;
      expect(quant.startingCapital).toBe(50_000_000);
      expect(quant.maxLeverage).toBe(5);
    });

    it('should include all 10 sectors', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.sectors).toBeDefined();
      const sectorKeys = Object.keys(body.data.sectors);
      expect(sectorKeys).toHaveLength(10);
      expect(sectorKeys).toContain('Technology');
      expect(sectorKeys).toContain('Finance');
      expect(sectorKeys).toContain('Healthcare');
      expect(sectorKeys).toContain('Energy');
      expect(sectorKeys).toContain('Consumer');
      expect(sectorKeys).toContain('Industrial');
      expect(sectorKeys).toContain('RealEstate');
      expect(sectorKeys).toContain('Utilities');
      expect(sectorKeys).toContain('Crypto');
      expect(sectorKeys).toContain('Meme');
    });

    it('should include sector volatility information', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      const tech = body.data.sectors.Technology;
      expect(tech.baseVolatility).toBe(0.025);
      expect(tech.marketCorrelation).toBe(1.2);
      expect(tech.displayName).toBe('Technology');
      expect(tech.description).toBeDefined();

      // Meme should be most volatile
      const meme = body.data.sectors.Meme;
      expect(meme.baseVolatility).toBe(0.08);
      expect(meme.marketCorrelation).toBe(0.2);

      // Utilities should be least volatile
      const utilities = body.data.sectors.Utilities;
      expect(utilities.baseVolatility).toBe(0.012);
    });

    it('should include rate limit information', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.rateLimits).toBeDefined();
      expect(body.data.rateLimits.apiRequestsPerMinute).toBe(100);
      expect(body.data.rateLimits.actionsPerTick).toBe(10);
      expect(body.data.rateLimits.websocketMessagesPerSecond).toBe(50);
      expect(body.data.rateLimits.webhookTimeoutMs).toBe(5000);
    });

    it('should include webhook configuration', async () => {
      const res = await app.request('/config');
      const body = await res.json();

      expect(body.data.webhooks).toBeDefined();
      expect(body.data.webhooks.signatureHeader).toBe('X-WSS-Signature');
      expect(body.data.webhooks.signatureAlgorithm).toBe('HMAC-SHA256');
      expect(body.data.webhooks.maxRetries).toBe(3);
      expect(body.data.webhooks.timeoutMs).toBe(5000);
    });
  });
});
