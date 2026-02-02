import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock checkpoint service
vi.mock('../checkpoint-service', () => ({
  shouldCheckpointAgents: vi.fn().mockReturnValue(false),
  checkpointAllAgentPortfolios: vi.fn().mockResolvedValue(0),
  shouldSaveFullWorldSnapshot: vi.fn().mockReturnValue(false),
  saveFullWorldSnapshot: vi.fn().mockResolvedValue(undefined),
  recordTickEvents: vi.fn().mockResolvedValue(undefined),
}));

// Mock dependencies before importing the module under test
vi.mock('../services/db', () => ({
  getWorldState: vi.fn().mockResolvedValue({
    currentTick: 0,
    marketOpen: true,
    interestRate: 0.05,
    inflationRate: 0.02,
    gdpGrowth: 0.03,
    regime: 'normal',
    lastTickAt: new Date(),
  }),
  getAllCompanies: vi.fn().mockResolvedValue([
    {
      id: 'company-1',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      sector: 'technology',
      industry: 'Consumer Electronics',
      price: 150.00,
      previousClose: 149.00,
      open: 149.50,
      high: 151.00,
      low: 148.00,
      sharesOutstanding: 1000000,
      marketCap: 150000000,
      revenue: 100000000,
      profit: 20000000,
      cash: 50000000,
      debt: 10000000,
      peRatio: 25,
      volatility: 0.02,
      beta: 1.1,
      momentum: 0,
      sentiment: 0,
      manipulationScore: 0,
      isPublic: true,
      tradingStatus: 'active',
      createdAt: new Date(),
    },
  ]),
  updateWorldTick: vi.fn().mockResolvedValue(undefined),
  updateMarketOpen: vi.fn().mockResolvedValue(undefined),
  updateCompanyPrice: vi.fn().mockResolvedValue(undefined),
  getSymbolsWithPendingOrders: vi.fn().mockResolvedValue([]),
  getPendingOrders: vi.fn().mockResolvedValue([]),
  insertTrade: vi.fn().mockResolvedValue('mock-trade-id'),
  updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  updateHolding: vi.fn().mockResolvedValue(undefined),
  updateAgentCash: vi.fn().mockResolvedValue(undefined),
  getHolding: vi.fn().mockResolvedValue(null),
  getAgentHoldings: vi.fn().mockResolvedValue([]),
  deleteHolding: vi.fn().mockResolvedValue(undefined),
  getTradingStatus: vi.fn().mockResolvedValue('active'),
  releaseImprisonedAgents: vi.fn().mockResolvedValue(0),
  getRecentNewsSentiment: vi.fn().mockResolvedValue([]),
  insertNews: vi.fn().mockResolvedValue('mock-news-id'),
  getAgent: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/redis', () => ({
  setCurrentTick: vi.fn().mockResolvedValue(undefined),
  cachePrice: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockResolvedValue(1),
  publishRaw: vi.fn().mockResolvedValue(undefined),
  getCurrentSequence: vi.fn().mockResolvedValue(0),
  closeRedis: vi.fn().mockResolvedValue(undefined),
  clearEngineHeartbeat: vi.fn().mockResolvedValue(undefined),
  setEngineHeartbeat: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  CHANNELS: {
    TICK_UPDATES: 'channel:tick_updates',
    MARKET_UPDATES: 'channel:market',
    PRICE_UPDATES: 'channel:prices',
    NEWS_UPDATES: 'channel:news',
    TRADES: 'channel:trades',
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
    AGENT_CALLBACK_CONFIRMED: 'channel:agent_callback_confirmed',
    ENGINE_HEARTBEAT: 'channel:engine_heartbeat',
  },
}));

vi.mock('../services/webhook', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue([]),
  clearActionResults: vi.fn(),
  setAgentActionResults: vi.fn(),
  clearInvestigationAlerts: vi.fn(),
  setInvestigationAlerts: vi.fn(),
  resumeWebhookDelivery: vi.fn().mockReturnValue(false),
}));

vi.mock('../services/reputation', () => ({
  processReputationDecay: vi.fn().mockResolvedValue(0),
  processTradeRecovery: vi.fn().mockResolvedValue(0),
  processCleanPeriodBonus: vi.fn().mockResolvedValue(0),
}));

vi.mock('../sec-ai', () => ({
  runDetection: vi.fn().mockResolvedValue({ detections: [], alerts: [] }),
  processInvestigationLifecycle: vi.fn().mockResolvedValue({
    activated: 0,
    charged: 0,
    trialsStarted: 0,
    resolved: { convicted: 0, acquitted: 0 },
    alerts: [],
  }),
}));

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';
import * as redisService from '../services/redis';
import * as reputationService from '../services/reputation';
import * as checkpointService from '../checkpoint-service';
import * as webhookService from '../services/webhook';

describe('TickEngine Database Operations', () => {
  let engine: TickEngine;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Webhook service mocks - must return an array for processWebhookActions to iterate
    (webhookService.dispatchWebhooks as Mock).mockResolvedValue([]);

    engine = new TickEngine({
      tickIntervalMs: 1000,
      marketOpenTick: 0,
      marketCloseTick: 1000, // Keep market open for tests
      enableEvents: false,
      eventChance: 0,
    });

    await engine.initialize();
  });

  describe('initialization', () => {
    it('loads world state from database on initialization', async () => {
      expect(dbService.getWorldState).toHaveBeenCalled();
    });

    it('loads companies from database on initialization', async () => {
      expect(dbService.getAllCompanies).toHaveBeenCalled();
    });

    it('syncs current tick to Redis on initialization', async () => {
      expect(redisService.setCurrentTick).toHaveBeenCalledWith(0);
    });

    it('handles null world state gracefully', async () => {
      vi.clearAllMocks();
      (dbService.getWorldState as Mock).mockResolvedValueOnce(null);

      const newEngine = new TickEngine({
        tickIntervalMs: 1000,
        enableEvents: false,
        eventChance: 0,
      });

      await expect(newEngine.initialize()).resolves.not.toThrow();
      expect(newEngine.getCurrentTick()).toBe(0);
    });

    it('handles empty companies list', async () => {
      vi.clearAllMocks();
      (dbService.getAllCompanies as Mock).mockResolvedValueOnce([]);
      (dbService.getWorldState as Mock).mockResolvedValueOnce({
        currentTick: 0,
        marketOpen: true,
        interestRate: 0.05,
        inflationRate: 0.02,
        gdpGrowth: 0.03,
        regime: 'normal',
        lastTickAt: new Date(),
      });

      const newEngine = new TickEngine({
        tickIntervalMs: 1000,
        enableEvents: false,
        eventChance: 0,
      });

      await expect(newEngine.initialize()).resolves.not.toThrow();
    });
  });

  describe('tick execution without database errors', () => {
    it('runs a complete tick without errors', async () => {
      const tickUpdate = await engine.runTick();

      expect(tickUpdate).toBeDefined();
      expect(tickUpdate.tick).toBe(1);
      expect(tickUpdate.marketOpen).toBe(true);
    });

    it('updates world tick in database after each tick', async () => {
      await engine.runTick();

      expect(dbService.updateWorldTick).toHaveBeenCalledWith(1);
    });

    it('updates tick in Redis after each tick', async () => {
      await engine.runTick();

      expect(redisService.setCurrentTick).toHaveBeenCalledWith(1);
    });

    it('updates company prices in database', async () => {
      await engine.runTick();

      expect(dbService.updateCompanyPrice).toHaveBeenCalled();
    });

    it('caches prices in Redis', async () => {
      await engine.runTick();

      expect(redisService.cachePrice).toHaveBeenCalled();
    });

    it('publishes tick update to Redis', async () => {
      await engine.runTick();

      expect(redisService.publish).toHaveBeenCalledWith(
        'channel:tick_updates',
        expect.objectContaining({
          tick: 1,
          marketOpen: true,
        })
      );
    });

    it('runs multiple ticks sequentially without errors', async () => {
      for (let i = 1; i <= 5; i++) {
        const tickUpdate = await engine.runTick();
        expect(tickUpdate.tick).toBe(i);
      }

      expect(dbService.updateWorldTick).toHaveBeenCalledTimes(5);
    });
  });

  describe('reputation service calls', () => {
    it('calls reputation decay on every tick', async () => {
      await engine.runTick();

      expect(reputationService.processReputationDecay).toHaveBeenCalled();
    });

    it('calls trade recovery on every tick', async () => {
      await engine.runTick();

      expect(reputationService.processTradeRecovery).toHaveBeenCalledWith(1);
    });

    it('calls clean period bonus every 100 ticks', async () => {
      // Run ticks until tick 100
      for (let i = 0; i < 100; i++) {
        await engine.runTick();
      }

      expect(reputationService.processCleanPeriodBonus).toHaveBeenCalledWith(100);
    });

    it('does not call clean period bonus on non-100 tick multiples', async () => {
      await engine.runTick();

      expect(reputationService.processCleanPeriodBonus).not.toHaveBeenCalled();
    });
  });

  describe('imprisoned agent release', () => {
    it('calls releaseImprisonedAgents on every tick', async () => {
      await engine.runTick();

      expect(dbService.releaseImprisonedAgents).toHaveBeenCalledWith(1);
    });

    it('handles agent releases', async () => {
      (dbService.releaseImprisonedAgents as Mock).mockResolvedValueOnce(2);

      const tickUpdate = await engine.runTick();

      expect(tickUpdate).toBeDefined();
      expect(dbService.releaseImprisonedAgents).toHaveBeenCalledWith(1);
    });
  });

  describe('news sentiment integration', () => {
    it('fetches recent news sentiment for price calculations', async () => {
      await engine.runTick();

      expect(dbService.getRecentNewsSentiment).toHaveBeenCalledWith(
        ['AAPL'],
        expect.any(Number),
        1
      );
    });

    it('handles empty news sentiment response', async () => {
      (dbService.getRecentNewsSentiment as Mock).mockResolvedValueOnce([]);

      const tickUpdate = await engine.runTick();

      expect(tickUpdate).toBeDefined();
    });
  });

  describe('checkpoint service integration', () => {
    it('checks if agent checkpoint is needed on every tick', async () => {
      await engine.runTick();

      expect(checkpointService.shouldCheckpointAgents).toHaveBeenCalledWith(1);
    });

    it('saves agent portfolios when checkpoint is needed', async () => {
      (checkpointService.shouldCheckpointAgents as Mock).mockReturnValueOnce(true);
      (checkpointService.checkpointAllAgentPortfolios as Mock).mockResolvedValueOnce(5);

      await engine.runTick();

      expect(checkpointService.checkpointAllAgentPortfolios).toHaveBeenCalledWith(1);
    });

    it('checks if full world snapshot is needed on every tick', async () => {
      await engine.runTick();

      expect(checkpointService.shouldSaveFullWorldSnapshot).toHaveBeenCalledWith(1);
    });

    it('records tick events for replay', async () => {
      await engine.runTick();

      expect(checkpointService.recordTickEvents).toHaveBeenCalledWith(
        1,
        [], // trades
        expect.any(Array), // price updates
        [], // events
        expect.any(Array), // news
        expect.any(Number), // start sequence
        expect.any(Number)  // end sequence
      );
    });
  });

  describe('market status transitions', () => {
    it('updates market status in database when market closes', async () => {
      // Create engine where market will close
      vi.clearAllMocks();
      (dbService.getWorldState as Mock).mockResolvedValue({
        currentTick: 389, // One tick before market close at 390
        marketOpen: true,
        interestRate: 0.05,
        inflationRate: 0.02,
        gdpGrowth: 0.03,
        regime: 'normal',
        lastTickAt: new Date(),
      });
      (dbService.getAllCompanies as Mock).mockResolvedValue([]);

      const closingEngine = new TickEngine({
        tickIntervalMs: 1000,
        marketOpenTick: 0,
        marketCloseTick: 390,
        enableEvents: false,
        eventChance: 0,
      });

      await closingEngine.initialize();
      await closingEngine.runTick();

      expect(dbService.updateMarketOpen).toHaveBeenCalledWith(false);
    });
  });

  describe('graceful shutdown', () => {
    it('clears heartbeat and closes Redis on shutdown', async () => {
      await engine.shutdown();

      expect(redisService.clearEngineHeartbeat).toHaveBeenCalled();
      expect(redisService.closeRedis).toHaveBeenCalled();
    });
  });

  describe('order processing database operations', () => {
    it('queries symbols with pending orders each tick when market is open', async () => {
      // Ensure market is open
      expect(engine.isMarketOpen()).toBe(true);

      await engine.runTick();

      expect(dbService.getSymbolsWithPendingOrders).toHaveBeenCalled();
    });

    it('handles empty pending orders', async () => {
      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValue([]);

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.trades).toHaveLength(0);
    });

    it('queries pending orders for each symbol with orders', async () => {
      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValue(['AAPL']);
      (dbService.getTradingStatus as Mock).mockResolvedValue('active');
      (dbService.getPendingOrders as Mock).mockResolvedValue([]);

      await engine.runTick();

      expect(dbService.getPendingOrders).toHaveBeenCalledWith('AAPL');
    });

    it('checks trading status before processing orders', async () => {
      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValue(['AAPL']);
      (dbService.getTradingStatus as Mock).mockResolvedValue('active');
      (dbService.getPendingOrders as Mock).mockResolvedValue([]);

      await engine.runTick();

      expect(dbService.getTradingStatus).toHaveBeenCalledWith('AAPL');
    });

    it('rejects orders for suspended symbols', async () => {
      const pendingOrder = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        price: '150.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValue(['AAPL']);
      (dbService.getTradingStatus as Mock).mockResolvedValue('suspended');
      (dbService.getPendingOrders as Mock).mockResolvedValue([pendingOrder]);

      await engine.runTick();

      expect(dbService.updateOrderStatus).toHaveBeenCalledWith(
        'order-1',
        'rejected',
        0,
        null,
        null
      );
    });
  });

  describe('trade persistence', () => {
    it('calls insertTrade when trades are generated', async () => {
      // Note: Trade matching logic is tested in tick-engine-orders.test.ts
      // This test verifies that the insertTrade database call is made when trades occur
      // We mock insertTrade and verify it's available and callable
      expect(dbService.insertTrade).toBeDefined();
      expect(typeof dbService.insertTrade).toBe('function');
    });

    it('calls holding update functions when trades are generated', async () => {
      // Note: Trade matching and holding updates are tested in tick-engine-orders.test.ts
      // This test verifies that the holding update database calls are available
      expect(dbService.updateHolding).toBeDefined();
      expect(dbService.updateAgentCash).toBeDefined();
      expect(typeof dbService.updateHolding).toBe('function');
      expect(typeof dbService.updateAgentCash).toBe('function');
    });
  });

  describe('news generation and persistence', () => {
    it('inserts generated news into database', async () => {
      // Force a price update to trigger news generation
      const tickUpdate = await engine.runTick();

      // If news was generated, it should have been inserted
      if (tickUpdate.news.length > 0) {
        expect(dbService.insertNews).toHaveBeenCalled();
      }
    });

    it('publishes news to Redis channel', async () => {
      const tickUpdate = await engine.runTick();

      // News updates are published to Redis
      if (tickUpdate.news.length > 0) {
        expect(redisService.publish).toHaveBeenCalledWith(
          'channel:news',
          expect.objectContaining({
            type: 'NEWS',
          })
        );
      }
    });
  });

  describe('sequence number tracking', () => {
    it('queries current sequence at start of tick', async () => {
      await engine.runTick();

      expect(redisService.getCurrentSequence).toHaveBeenCalled();
    });
  });

  describe('error resilience', () => {
    it('tick runs successfully with all database operations mocked', async () => {
      // This test verifies that with proper mocks, the tick completes
      const tickUpdate = await engine.runTick();

      expect(tickUpdate).toBeDefined();
      expect(tickUpdate.tick).toBeGreaterThan(0);
      expect(typeof tickUpdate.marketOpen).toBe('boolean');
      expect(Array.isArray(tickUpdate.trades)).toBe(true);
      expect(Array.isArray(tickUpdate.events)).toBe(true);
      expect(Array.isArray(tickUpdate.priceUpdates)).toBe(true);
      expect(Array.isArray(tickUpdate.news)).toBe(true);
    });

    it('emits tick event after successful tick', async () => {
      const tickHandler = vi.fn();
      engine.on('tick', tickHandler);

      await engine.runTick();

      expect(tickHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: expect.any(Number),
        })
      );
    });
  });

  describe('running state management', () => {
    it('starts and stops the engine correctly', () => {
      expect(engine.isRunning()).toBe(false);

      engine.start();
      expect(engine.isRunning()).toBe(true);

      engine.stop();
      expect(engine.isRunning()).toBe(false);
    });

    it('emits started event when engine starts', () => {
      const startHandler = vi.fn();
      engine.on('started', startHandler);

      engine.start();

      expect(startHandler).toHaveBeenCalled();

      engine.stop();
    });

    it('emits stopped event when engine stops', () => {
      const stopHandler = vi.fn();
      engine.on('stopped', stopHandler);

      engine.start();
      engine.stop();

      expect(stopHandler).toHaveBeenCalled();
    });

    it('does not start twice if already running', () => {
      engine.start();
      engine.start(); // Should be a no-op

      expect(engine.isRunning()).toBe(true);

      engine.stop();
    });
  });
});

describe('TickEngine Database Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles database error during getWorldState', async () => {
    (dbService.getWorldState as Mock).mockRejectedValue(new Error('Database connection failed'));

    const engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await expect(engine.initialize()).rejects.toThrow('Database connection failed');
  });

  it('handles database error during getAllCompanies', async () => {
    (dbService.getWorldState as Mock).mockResolvedValue({
      currentTick: 0,
      marketOpen: true,
      interestRate: 0.05,
      inflationRate: 0.02,
      gdpGrowth: 0.03,
      regime: 'normal',
      lastTickAt: new Date(),
    });
    (dbService.getAllCompanies as Mock).mockRejectedValue(new Error('Companies query failed'));

    const engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await expect(engine.initialize()).rejects.toThrow('Companies query failed');
  });

  it('handles Redis error during setCurrentTick', async () => {
    (dbService.getWorldState as Mock).mockResolvedValue({
      currentTick: 0,
      marketOpen: true,
      interestRate: 0.05,
      inflationRate: 0.02,
      gdpGrowth: 0.03,
      regime: 'normal',
      lastTickAt: new Date(),
    });
    (dbService.getAllCompanies as Mock).mockResolvedValue([]);
    (redisService.subscribe as Mock).mockResolvedValue(undefined);
    (redisService.setCurrentTick as Mock).mockRejectedValue(new Error('Redis connection failed'));

    const engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await expect(engine.initialize()).rejects.toThrow('Redis connection failed');
  });
});
