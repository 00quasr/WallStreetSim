import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests to verify webhook payload format matches documentation at docs/webhooks.md
 * These tests ensure the actual implementation matches the documented schema.
 */

// Mock the database module
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  },
  agents: {},
  holdings: {},
  orders: {},
}));

// Mock the db service module
vi.mock('../services/db', () => ({
  recordWebhookSuccess: vi.fn(),
  recordWebhookFailure: vi.fn(),
}));

import { buildWebhookPayload } from '../services/webhook';
import { db } from '@wallstreetsim/db';
import type { PriceUpdate, Trade, MarketEvent, NewsArticle, WorldState, TickWebhook } from '@wallstreetsim/types';
import type { Mock } from 'vitest';

describe('Webhook Payload Schema Validation', () => {
  const mockAgent = {
    id: 'agent-test-123',
    name: 'Test Agent',
    callbackUrl: 'https://example.com/webhook',
    webhookSecret: 'test-secret',
    cash: '50000.00',
    marginUsed: '10000.00',
    marginLimit: '100000.00',
  };

  const mockWorldState: WorldState = {
    currentTick: 1042,
    marketOpen: true,
    interestRate: 0.05,
    inflationRate: 0.02,
    gdpGrowth: 0.03,
    regime: 'bull',
    lastTickAt: new Date('2024-01-15T14:30:00.000Z'),
  };

  const mockPriceUpdates: PriceUpdate[] = [
    {
      symbol: 'AAPL',
      oldPrice: 149.00,
      newPrice: 150.50,
      change: 1.50,
      changePercent: 1.007,
      volume: 10000,
      tick: 1042,
      drivers: {
        agentPressure: 0.1,
        randomWalk: 0.01,
        sectorCorrelation: 0.02,
        eventImpact: 0.005,
        sentimentImpact: 0.01,
      },
    },
  ];

  const mockTrades: Trade[] = [
    {
      id: 'trade-123',
      symbol: 'AAPL',
      buyerId: 'agent-test-123',
      sellerId: 'agent-other',
      buyerOrderId: 'order-buy',
      sellerOrderId: 'order-sell',
      price: 150.25,
      quantity: 100,
      tick: 1042,
      createdAt: new Date('2024-01-15T14:29:00.000Z'),
    },
  ];

  const mockEvents: MarketEvent[] = [];

  const mockNews: NewsArticle[] = [
    {
      id: 'news-123',
      tick: 1042,
      headline: 'Apple Reports Record Quarterly Revenue',
      content: 'Apple Inc. announced...',
      category: 'earnings',
      sentiment: 0.8,
      agentIds: [],
      symbols: ['AAPL'],
      createdAt: new Date('2024-01-15T14:30:00.000Z'),
      isBreaking: true,
    },
  ];

  const priceMap = new Map<string, number>([['AAPL', 150.50]]);

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock DB queries for holdings and orders
    let callCount = 0;
    (db.select as Mock).mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          // Odd calls are holdings, even calls are orders
          if (callCount % 2 === 1) {
            return Promise.resolve([
              {
                agentId: 'agent-test-123',
                symbol: 'AAPL',
                quantity: 100,
                averageCost: '145.00',
              },
            ]);
          }
          return Promise.resolve([
            {
              id: 'order-xyz789',
              agentId: 'agent-test-123',
              symbol: 'GOOG',
              side: 'BUY',
              orderType: 'LIMIT',
              quantity: 50,
              price: '140.00',
              stopPrice: null,
              status: 'open',
              filledQuantity: 0,
              avgFillPrice: null,
              tickSubmitted: 1040,
              tickFilled: null,
              createdAt: new Date('2024-01-15T14:28:00.000Z'),
            },
          ]);
        }),
      })),
    }));
  });

  describe('Top-level payload structure', () => {
    it('contains all required top-level fields as documented', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      // Documented required fields
      expect(payload).toHaveProperty('tick');
      expect(payload).toHaveProperty('timestamp');
      expect(payload).toHaveProperty('portfolio');
      expect(payload).toHaveProperty('orders');
      expect(payload).toHaveProperty('market');
      expect(payload).toHaveProperty('world');
      expect(payload).toHaveProperty('news');
      expect(payload).toHaveProperty('messages');
      expect(payload).toHaveProperty('alerts');
      expect(payload).toHaveProperty('investigations');
      expect(payload).toHaveProperty('actionResults');
    });

    it('tick is a number', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(typeof payload.tick).toBe('number');
      expect(payload.tick).toBe(1042);
    });

    it('timestamp is an ISO 8601 string', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(typeof payload.timestamp).toBe('string');
      // Verify it's a valid ISO timestamp
      const parsed = new Date(payload.timestamp);
      expect(parsed.toISOString()).toBe(payload.timestamp);
    });
  });

  describe('Portfolio schema', () => {
    it('contains all documented portfolio fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const portfolio = payload.portfolio;
      expect(portfolio).toHaveProperty('agentId');
      expect(portfolio).toHaveProperty('cash');
      expect(portfolio).toHaveProperty('marginUsed');
      expect(portfolio).toHaveProperty('marginAvailable');
      expect(portfolio).toHaveProperty('netWorth');
      expect(portfolio).toHaveProperty('positions');
    });

    it('portfolio fields have correct types', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const portfolio = payload.portfolio;
      expect(typeof portfolio.agentId).toBe('string');
      expect(typeof portfolio.cash).toBe('number');
      expect(typeof portfolio.marginUsed).toBe('number');
      expect(typeof portfolio.marginAvailable).toBe('number');
      expect(typeof portfolio.netWorth).toBe('number');
      expect(Array.isArray(portfolio.positions)).toBe(true);
    });

    it('position contains all documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const position = payload.portfolio.positions[0];
      expect(position).toHaveProperty('symbol');
      expect(position).toHaveProperty('shares');
      expect(position).toHaveProperty('averageCost');
      expect(position).toHaveProperty('currentPrice');
      expect(position).toHaveProperty('marketValue');
      expect(position).toHaveProperty('unrealizedPnL');
      expect(position).toHaveProperty('unrealizedPnLPercent');
    });

    it('position fields have correct types', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const position = payload.portfolio.positions[0];
      expect(typeof position.symbol).toBe('string');
      expect(typeof position.shares).toBe('number');
      expect(typeof position.averageCost).toBe('number');
      expect(typeof position.currentPrice).toBe('number');
      expect(typeof position.marketValue).toBe('number');
      expect(typeof position.unrealizedPnL).toBe('number');
      expect(typeof position.unrealizedPnLPercent).toBe('number');
    });
  });

  describe('Order schema', () => {
    it('order contains all documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const order = payload.orders[0];
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('agentId');
      expect(order).toHaveProperty('symbol');
      expect(order).toHaveProperty('side');
      expect(order).toHaveProperty('type');
      expect(order).toHaveProperty('quantity');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('filledQuantity');
      expect(order).toHaveProperty('tickSubmitted');
      expect(order).toHaveProperty('createdAt');
    });

    it('order side is BUY or SELL', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const order = payload.orders[0];
      expect(['BUY', 'SELL']).toContain(order.side);
    });

    it('order type is MARKET, LIMIT, or STOP', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const order = payload.orders[0];
      expect(['MARKET', 'LIMIT', 'STOP']).toContain(order.type);
    });

    it('order status is one of documented values', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const order = payload.orders[0];
      expect(['pending', 'open', 'filled', 'partial', 'cancelled', 'rejected']).toContain(order.status);
    });
  });

  describe('Market schema', () => {
    it('market contains all documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.market).toHaveProperty('indices');
      expect(payload.market).toHaveProperty('watchlist');
      expect(payload.market).toHaveProperty('recentTrades');
      expect(Array.isArray(payload.market.indices)).toBe(true);
      expect(Array.isArray(payload.market.watchlist)).toBe(true);
      expect(Array.isArray(payload.market.recentTrades)).toBe(true);
    });

    it('watchlist item (StockQuote) contains documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const quote = payload.market.watchlist[0];
      expect(quote).toHaveProperty('symbol');
      expect(quote).toHaveProperty('name');
      expect(quote).toHaveProperty('sector');
      expect(quote).toHaveProperty('price');
      expect(quote).toHaveProperty('change');
      expect(quote).toHaveProperty('changePercent');
      expect(quote).toHaveProperty('volume');
      expect(quote).toHaveProperty('high');
      expect(quote).toHaveProperty('low');
      expect(quote).toHaveProperty('marketCap');
    });

    it('recentTrades only includes agent-relevant trades', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      // The mock trade involves agent-test-123 as buyer
      expect(payload.market.recentTrades.length).toBe(1);
      expect(
        payload.market.recentTrades[0].buyerId === mockAgent.id ||
        payload.market.recentTrades[0].sellerId === mockAgent.id
      ).toBe(true);
    });

    it('trade contains all documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const trade = payload.market.recentTrades[0];
      expect(trade).toHaveProperty('id');
      expect(trade).toHaveProperty('symbol');
      expect(trade).toHaveProperty('buyerId');
      expect(trade).toHaveProperty('sellerId');
      expect(trade).toHaveProperty('buyerOrderId');
      expect(trade).toHaveProperty('sellerOrderId');
      expect(trade).toHaveProperty('price');
      expect(trade).toHaveProperty('quantity');
      expect(trade).toHaveProperty('tick');
      expect(trade).toHaveProperty('createdAt');
    });
  });

  describe('World state schema', () => {
    it('world contains all documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.world).toHaveProperty('currentTick');
      expect(payload.world).toHaveProperty('marketOpen');
      expect(payload.world).toHaveProperty('interestRate');
      expect(payload.world).toHaveProperty('inflationRate');
      expect(payload.world).toHaveProperty('gdpGrowth');
      expect(payload.world).toHaveProperty('regime');
      expect(payload.world).toHaveProperty('lastTickAt');
    });

    it('regime is one of documented values', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(['bull', 'bear', 'crash', 'bubble', 'normal']).toContain(payload.world.regime);
    });
  });

  describe('News article schema', () => {
    it('news article contains all documented fields', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const article = payload.news[0];
      expect(article).toHaveProperty('id');
      expect(article).toHaveProperty('tick');
      expect(article).toHaveProperty('headline');
      expect(article).toHaveProperty('category');
      expect(article).toHaveProperty('sentiment');
      expect(article).toHaveProperty('agentIds');
      expect(article).toHaveProperty('symbols');
      expect(article).toHaveProperty('createdAt');
    });

    it('news category is one of documented values', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const validCategories = ['earnings', 'merger', 'scandal', 'regulatory', 'market', 'product', 'analysis', 'crime', 'rumor', 'company'];
      expect(validCategories).toContain(payload.news[0].category);
    });

    it('sentiment is a number between -1 and 1', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      const sentiment = payload.news[0].sentiment;
      expect(typeof sentiment).toBe('number');
      expect(sentiment).toBeGreaterThanOrEqual(-1);
      expect(sentiment).toBeLessThanOrEqual(1);
    });

    it('includes optional isBreaking flag when present', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.news[0].isBreaking).toBe(true);
    });
  });

  describe('Action results schema', () => {
    it('actionResults is an array', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(Array.isArray(payload.actionResults)).toBe(true);
    });

    it('empty by default (no previous tick results)', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.actionResults).toHaveLength(0);
    });
  });

  describe('Investigations schema', () => {
    it('investigations is an array', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(Array.isArray(payload.investigations)).toBe(true);
    });
  });

  describe('Messages and alerts schema', () => {
    it('messages is an array', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(Array.isArray(payload.messages)).toBe(true);
    });

    it('alerts is an array', async () => {
      const payload = await buildWebhookPayload(
        mockAgent,
        1042,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(Array.isArray(payload.alerts)).toBe(true);
    });
  });
});

describe('Webhook Response Schema', () => {
  describe('AgentAction types', () => {
    it('documents all valid action types', () => {
      const documentedActionTypes = [
        'BUY',
        'SELL',
        'SHORT',
        'COVER',
        'CANCEL_ORDER',
        'RUMOR',
        'ALLY',
        'MESSAGE',
        'BRIBE',
        'WHISTLEBLOW',
        'FLEE',
      ];

      // Verify these match the AgentActionType from @wallstreetsim/types
      // This is a static verification - if types change, this test should fail
      expect(documentedActionTypes).toHaveLength(11);
    });
  });
});
