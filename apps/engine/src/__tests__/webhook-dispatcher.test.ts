import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';

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
  companies: {},
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  getAgentsWithCallbacks,
  buildWebhookPayload,
  dispatchWebhooks,
} from '../services/webhook';
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
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: 'https://agent2.example.com/webhook',
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
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: null,
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
      // Mock holdings query
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              agentId: 'agent-1',
              symbol: 'AAPL',
              quantity: 100,
              averageCost: '145.00',
            },
          ]),
        }),
      });
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
          cash: '10000.00',
          marginUsed: '0.00',
          marginLimit: '50000.00',
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          callbackUrl: 'https://agent2.example.com/webhook',
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
          }),
        })
      );
    });

    it('returns success result for successful webhook', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          callbackUrl: 'https://agent1.example.com/webhook',
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
  });
});
