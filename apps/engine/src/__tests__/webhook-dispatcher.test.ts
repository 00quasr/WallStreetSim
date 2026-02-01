import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from '@wallstreetsim/utils';

// Mock the database module
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  agents: {
    webhookFailures: 'webhook_failures',
  },
  holdings: {},
  orders: {},
  companies: {},
}));

// Mock the db service module
vi.mock('../services/db', () => ({
  recordWebhookSuccess: vi.fn(),
  recordWebhookFailure: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  getAgentsWithCallbacks,
  buildWebhookPayload,
  dispatchWebhooks,
} from '../services/webhook';
import * as dbService from '../services/db';
import type { PriceUpdate, Trade, MarketEvent, NewsArticle, WorldState } from '@wallstreetsim/types';
import { db } from '@wallstreetsim/db';

describe('Webhook Dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAgentsWithCallbacks', () => {
    it('returns agents with callback URLs', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: 'https://agent2.example.com/webhook',
          webhookSecret: 'secret2',
          cash: '25000.00',
          marginUsed: '1000.00',
          marginLimit: '100000.00',
        },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockAgents),
        }),
      });

      const result = await getAgentsWithCallbacks();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('agent-1');
      expect(result[0].callbackUrl).toBe('https://agent1.example.com/webhook');
      expect(result[1].id).toBe('agent-2');
    });

    it('filters out agents with null callback URLs', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: null,
          webhookSecret: null,
          cash: '25000.00',
          marginUsed: '1000.00',
          marginLimit: '100000.00',
        },
      ];

      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockAgents),
        }),
      });

      const result = await getAgentsWithCallbacks();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('agent-1');
    });

    it('returns empty array when no agents have callbacks', async () => {
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await getAgentsWithCallbacks();

      expect(result).toHaveLength(0);
    });
  });

  describe('buildWebhookPayload', () => {
    const mockAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      callbackUrl: 'https://example.com/webhook',
      webhookSecret: 'test-secret',
      cash: '10000.00',
      marginUsed: '0.00',
      marginLimit: '50000.00',
    };

    const mockWorldState: WorldState = {
      currentTick: 100,
      marketOpen: true,
      interestRate: 0.05,
      inflationRate: 0.02,
      gdpGrowth: 0.03,
      regime: 'normal',
      lastTickAt: new Date(),
    };

    const mockPriceUpdates: PriceUpdate[] = [
      {
        symbol: 'AAPL',
        oldPrice: 149.00,
        newPrice: 150.50,
        change: 1.50,
        changePercent: 1.007,
        volume: 10000,
        tick: 100,
        drivers: {
          agentPressure: 0,
          randomWalk: 0.01,
          sectorCorrelation: 0,
          eventImpact: 0,
        },
      },
    ];

    const mockTrades: Trade[] = [
      {
        id: 'trade-1',
        symbol: 'AAPL',
        buyerId: 'agent-1',
        sellerId: 'agent-2',
        buyerOrderId: 'order-1',
        sellerOrderId: 'order-2',
        price: 150.50,
        quantity: 100,
        tick: 100,
        createdAt: new Date(),
      },
    ];

    const mockEvents: MarketEvent[] = [];
    const mockNews: NewsArticle[] = [];

    beforeEach(() => {
      // Mock holdings and orders queries (called in parallel via Promise.all)
      let callCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            // First call is holdings, second is orders
            if (callCount % 2 === 1) {
              return Promise.resolve([
                {
                  agentId: 'agent-1',
                  symbol: 'AAPL',
                  quantity: 100,
                  averageCost: '145.00',
                },
              ]);
            }
            // Orders query returns empty array by default
            return Promise.resolve([]);
          }),
        })),
      }));
    });

    it('builds payload with correct tick number', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.tick).toBe(100);
    });

    it('builds payload with timestamp string', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(typeof payload.timestamp).toBe('string');
      // Verify it's a valid ISO timestamp
      expect(() => new Date(payload.timestamp)).not.toThrow();
    });

    it('builds payload with portfolio data', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.portfolio).toBeDefined();
      expect(payload.portfolio.agentId).toBe('agent-1');
      expect(payload.portfolio.cash).toBe(10000);
    });

    it('builds payload with market data', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.market).toBeDefined();
      expect(payload.market.watchlist).toHaveLength(1);
      expect(payload.market.watchlist[0].symbol).toBe('AAPL');
      expect(payload.market.watchlist[0].price).toBe(150.50);
    });

    it('includes only trades relevant to the agent', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const trades: Trade[] = [
        {
          id: 'trade-1',
          symbol: 'AAPL',
          buyerId: 'agent-1',
          sellerId: 'agent-2',
          buyerOrderId: 'order-1',
          sellerOrderId: 'order-2',
          price: 150.50,
          quantity: 100,
          tick: 100,
          createdAt: new Date(),
        },
        {
          id: 'trade-2',
          symbol: 'GOOG',
          buyerId: 'agent-3',
          sellerId: 'agent-4',
          buyerOrderId: 'order-3',
          sellerOrderId: 'order-4',
          price: 2800.00,
          quantity: 50,
          tick: 100,
          createdAt: new Date(),
        },
      ];

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        trades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.market.recentTrades).toHaveLength(1);
      expect(payload.market.recentTrades[0].id).toBe('trade-1');
    });

    it('includes world state data', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.world).toBeDefined();
      expect(payload.world.currentTick).toBe(100);
      expect(payload.world.marketOpen).toBe(true);
      expect(payload.world.regime).toBe('normal');
    });

    it('includes orders array (empty when no active orders)', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.orders).toBeDefined();
      expect(Array.isArray(payload.orders)).toBe(true);
      expect(payload.orders).toHaveLength(0);
    });

    it('includes agent active orders', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const mockOrders = [
        {
          id: 'order-1',
          agentId: 'agent-1',
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 50,
          price: '148.00',
          stopPrice: null,
          status: 'open',
          filledQuantity: 0,
          avgFillPrice: null,
          tickSubmitted: 99,
          tickFilled: null,
          createdAt: new Date(),
        },
        {
          id: 'order-2',
          agentId: 'agent-1',
          symbol: 'GOOG',
          side: 'SELL',
          orderType: 'STOP',
          quantity: 25,
          price: null,
          stopPrice: '2750.00',
          status: 'pending',
          filledQuantity: 0,
          avgFillPrice: null,
          tickSubmitted: 98,
          tickFilled: null,
          createdAt: new Date(),
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            // First call is holdings, second is orders
            if (callCount % 2 === 1) {
              return Promise.resolve([
                {
                  agentId: 'agent-1',
                  symbol: 'AAPL',
                  quantity: 100,
                  averageCost: '145.00',
                },
              ]);
            }
            return Promise.resolve(mockOrders);
          }),
        })),
      }));

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.orders).toHaveLength(2);
      expect(payload.orders[0].id).toBe('order-1');
      expect(payload.orders[0].symbol).toBe('AAPL');
      expect(payload.orders[0].side).toBe('BUY');
      expect(payload.orders[0].type).toBe('LIMIT');
      expect(payload.orders[0].quantity).toBe(50);
      expect(payload.orders[0].price).toBe(148);
      expect(payload.orders[0].status).toBe('open');

      expect(payload.orders[1].id).toBe('order-2');
      expect(payload.orders[1].symbol).toBe('GOOG');
      expect(payload.orders[1].side).toBe('SELL');
      expect(payload.orders[1].type).toBe('STOP');
      expect(payload.orders[1].stopPrice).toBe(2750);
      expect(payload.orders[1].status).toBe('pending');
    });

    it('includes partially filled orders', async () => {
      const priceMap = new Map([['AAPL', 150.50]]);

      const mockOrders = [
        {
          id: 'order-1',
          agentId: 'agent-1',
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: 100,
          price: '150.00',
          stopPrice: null,
          status: 'partial',
          filledQuantity: 60,
          avgFillPrice: '149.50',
          tickSubmitted: 95,
          tickFilled: null,
          createdAt: new Date(),
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount % 2 === 1) {
              return Promise.resolve([]);
            }
            return Promise.resolve(mockOrders);
          }),
        })),
      }));

      const payload = await buildWebhookPayload(
        mockAgent,
        100,
        mockWorldState,
        mockPriceUpdates,
        mockTrades,
        mockEvents,
        mockNews,
        priceMap
      );

      expect(payload.orders).toHaveLength(1);
      expect(payload.orders[0].status).toBe('partial');
      expect(payload.orders[0].filledQuantity).toBe(60);
      expect(payload.orders[0].avgFillPrice).toBe(149.5);
    });
  });

  describe('dispatchWebhooks', () => {
    const mockWorldState: WorldState = {
      currentTick: 100,
      marketOpen: true,
      interestRate: 0.05,
      inflationRate: 0.02,
      gdpGrowth: 0.03,
      regime: 'normal',
      lastTickAt: new Date(),
    };

    const mockPriceUpdates: PriceUpdate[] = [
      {
        symbol: 'AAPL',
        oldPrice: 149.00,
        newPrice: 150.50,
        change: 1.50,
        changePercent: 1.007,
        volume: 10000,
        tick: 100,
        drivers: {
          agentPressure: 0,
          randomWalk: 0.01,
          sectorCorrelation: 0,
          eventImpact: 0,
        },
      },
    ];

    beforeEach(() => {
      // Default: no agents with callbacks
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
    });

    it('returns empty array when no agents have callbacks', async () => {
      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends webhook to each agent with callback URL', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: 'https://agent2.example.com/webhook',
          webhookSecret: 'secret2',
          cash: '25000.00',
          marginUsed: '1000.00',
          marginLimit: '100000.00',
        },
      ];

      // First call: getAgentsWithCallbacks
      // Subsequent calls: getAgentPortfolio (holdings)
      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]); // No holdings
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('sends POST request with correct headers', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'test-secret-123',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://agent1.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-WallStreetSim-Tick': '100',
            'X-WallStreetSim-Agent': 'agent-1',
            'X-WallStreetSim-Signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
          }),
        })
      );
    });

    it('includes verifiable HMAC signature when agent has webhook secret', async () => {
      const webhookSecret = 'my-test-secret-for-verification';
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret,
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      // Get the body and signature from the fetch call
      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body as string;
      const signature = fetchCall[1].headers['X-WallStreetSim-Signature'] as string;

      // Verify the signature is valid
      expect(verifyWebhookSignature(body, signature, webhookSecret)).toBe(true);
    });

    it('does not include signature header when agent has no webhook secret', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: null,
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers as Record<string, string>;

      expect(headers['X-WallStreetSim-Signature']).toBeUndefined();
    });

    it('returns success result for successful webhook', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[0].statusCode).toBe(200);
    });

    it('returns failure result for failed webhook', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[0].statusCode).toBe(500);
      expect(results[0].error).toContain('500');
    });

    it('handles network errors gracefully', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[0].error).toBe('Network error');
    });

    it('parses action response from webhook', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      const mockActions = [
        { type: 'BUY', payload: { symbol: 'AAPL', quantity: 100 } },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ actions: mockActions }),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].actions).toBeDefined();
      expect(results[0].actions).toHaveLength(1);
      expect(results[0].actions![0].type).toBe('BUY');
    });

    it('includes response time in results', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
      );

      expect(results).toHaveLength(1);
      expect(results[0].responseTimeMs).toBeDefined();
      expect(typeof results[0].responseTimeMs).toBe('number');
      expect(results[0].responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('records webhook success for successful webhook with response time', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      expect(dbService.recordWebhookSuccess).toHaveBeenCalledWith('agent-1', expect.any(Number));
      expect(dbService.recordWebhookFailure).not.toHaveBeenCalled();
    });

    it('records webhook failure for failed webhook', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      expect(dbService.recordWebhookFailure).toHaveBeenCalledWith('agent-1', 'HTTP 500: Internal Server Error');
      expect(dbService.recordWebhookSuccess).not.toHaveBeenCalled();
    });

    it('records webhook failure for network error', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      expect(dbService.recordWebhookFailure).toHaveBeenCalledWith('agent-1', 'Connection refused');
      expect(dbService.recordWebhookSuccess).not.toHaveBeenCalled();
    });

    it('tracks successes and failures separately for multiple agents', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
          webhookSecret: 'secret1',
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: 'https://agent2.example.com/webhook',
          webhookSecret: 'secret2',
          cash: '20000.00',
          marginUsed: '0.00',
          marginLimit: '100000.00',
        },
      ];

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve(mockAgents);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      // Agent 1 succeeds, Agent 2 fails with non-retryable 400 error
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: () => Promise.resolve({}),
        });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], []);

      expect(dbService.recordWebhookSuccess).toHaveBeenCalledWith('agent-1', expect.any(Number));
      expect(dbService.recordWebhookFailure).toHaveBeenCalledWith('agent-2', 'HTTP 400: Bad Request');
    });
  });

  describe('webhook retry logic', () => {
    const mockWorldState: WorldState = {
      currentTick: 100,
      marketOpen: true,
      interestRate: 0.05,
      inflationRate: 0.02,
      gdpGrowth: 0.03,
      regime: 'normal',
      lastTickAt: new Date(),
    };

    const mockPriceUpdates: PriceUpdate[] = [
      {
        symbol: 'AAPL',
        oldPrice: 149.00,
        newPrice: 150.50,
        change: 1.50,
        changePercent: 1.007,
        volume: 10000,
        tick: 100,
        drivers: {
          agentPressure: 0,
          randomWalk: 0.01,
          sectorCorrelation: 0,
          eventImpact: 0,
        },
      },
    ];

    const mockAgent = {
      id: 'agent-1',
      name: 'Agent One',
      callbackUrl: 'https://agent1.example.com/webhook',
      webhookSecret: 'secret1',
      cash: '10000.00',
      marginUsed: '0.00',
      marginLimit: '50000.00',
    };

    beforeEach(() => {
      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        }),
      });
    });

    it('retries failed webhook up to 3 times on server error (5xx)', async () => {
      // Fail 3 times with 500 error, then succeed
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(4); // 1 initial + 3 retries
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('retries on rate limiting (429) and eventually succeeds', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on timeout and eventually succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('aborted'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(2);
    });

    it('retries on network errors and eventually succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(3);
    });

    it('fails after exhausting all retries', async () => {
      // All 4 attempts fail with 500 error
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(4); // 1 initial + 3 retries
      expect(results[0].error).toContain('500');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('does not retry on 4xx client errors (except 429)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(1); // No retries for 4xx
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(1);
    });

    it('does not retry on 404 not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].attempts).toBe(1);
    });

    it('includes attempts count in successful result', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].attempts).toBe(1);
    });

    it('records success only after successful retry', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });

      await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(dbService.recordWebhookSuccess).toHaveBeenCalledWith('agent-1', expect.any(Number));
      expect(dbService.recordWebhookFailure).not.toHaveBeenCalled();
    });

    it('records failure only after all retries exhausted', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(dbService.recordWebhookFailure).toHaveBeenCalledWith('agent-1', 'HTTP 500: Internal Server Error');
      expect(dbService.recordWebhookSuccess).not.toHaveBeenCalled();
    });

    it('respects maxRetries config override', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 1 } // Only 1 retry
      );

      expect(results).toHaveLength(1);
      expect(results[0].attempts).toBe(2); // 1 initial + 1 retry
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('can disable retries by setting maxRetries to 0', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 0 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].attempts).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('preserves actions from successful retry response', async () => {
      const mockActions = [
        { type: 'BUY', payload: { symbol: 'AAPL', quantity: 100 } },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ actions: mockActions }),
        });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        [],
        { maxRetries: 3 }
      );

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].actions).toHaveLength(1);
      expect(results[0].actions![0].type).toBe('BUY');
    });

    it('uses default maxRetries of 3 when not specified', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(
        100,
        mockWorldState,
        mockPriceUpdates,
        [],
        [],
        []
        // No config override - should use default maxRetries: 3
      );

      expect(results).toHaveLength(1);
      expect(results[0].attempts).toBe(4); // 1 initial + 3 retries (default)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
