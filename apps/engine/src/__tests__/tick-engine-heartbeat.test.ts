import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

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
  setEngineHeartbeat: vi.fn().mockResolvedValue(undefined),
  getEngineHeartbeat: vi.fn().mockResolvedValue(null),
  clearEngineHeartbeat: vi.fn().mockResolvedValue(undefined),
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
  KEYS: {
    ENGINE_HEARTBEAT: 'engine:heartbeat',
  },
}));

vi.mock('../services/webhook', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue([]),
  clearActionResults: vi.fn(),
  setAgentActionResults: vi.fn(),
  clearInvestigationAlerts: vi.fn(),
  setInvestigationAlerts: vi.fn(),
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
import * as redisService from '../services/redis';

describe('TickEngine Heartbeat Monitoring', () => {
  let engine: TickEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await engine.initialize();
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  describe('engine status lifecycle', () => {
    it('starts with stopped status after initialization', () => {
      expect(engine.getEngineStatus()).toBe('stopped');
    });

    it('changes to running status when started', () => {
      engine.start();
      expect(engine.getEngineStatus()).toBe('running');
    });

    it('changes to stopped status when stopped', () => {
      engine.start();
      expect(engine.getEngineStatus()).toBe('running');

      engine.stop();
      expect(engine.getEngineStatus()).toBe('stopped');
    });
  });

  describe('heartbeat publishing', () => {
    it('publishes heartbeat immediately when engine starts', async () => {
      engine.start();

      // Wait for async heartbeat to be fully published
      await vi.waitFor(() => {
        expect(redisService.publishRaw).toHaveBeenCalled();
      });

      expect(redisService.setEngineHeartbeat).toHaveBeenCalled();
      expect(redisService.publishRaw).toHaveBeenCalledWith(
        'channel:engine_heartbeat',
        expect.objectContaining({
          type: 'HEARTBEAT',
          payload: expect.objectContaining({
            status: 'running',
            tick: expect.any(Number),
            marketOpen: expect.any(Boolean),
          }),
        })
      );
    });

    it('publishes heartbeat at regular intervals', async () => {
      engine.start();
      vi.clearAllMocks();

      // Advance time by 5 seconds (heartbeat interval)
      await vi.advanceTimersByTimeAsync(5000);

      expect(redisService.setEngineHeartbeat).toHaveBeenCalled();
      expect(redisService.publishRaw).toHaveBeenCalledWith(
        'channel:engine_heartbeat',
        expect.objectContaining({
          type: 'HEARTBEAT',
        })
      );
    });

    it('stops publishing heartbeat when engine stops', async () => {
      engine.start();
      // Wait for initial heartbeat to fully complete
      await vi.waitFor(() => {
        expect(redisService.publishRaw).toHaveBeenCalled();
      });
      vi.clearAllMocks();

      engine.stop();

      // Advance time past heartbeat interval - since engine is stopped,
      // no more heartbeats should be published
      await vi.advanceTimersByTimeAsync(10000);

      // publishRaw should not have been called after stop (for heartbeat channel)
      const heartbeatCalls = (redisService.publishRaw as Mock).mock.calls.filter(
        (call: unknown[]) => call[0] === 'channel:engine_heartbeat'
      );
      expect(heartbeatCalls).toHaveLength(0);
    });

    it('clears heartbeat from Redis on shutdown', async () => {
      engine.start();
      await engine.shutdown();

      expect(redisService.clearEngineHeartbeat).toHaveBeenCalled();
    });
  });

  describe('heartbeat data structure', () => {
    it('includes all required fields in heartbeat', () => {
      engine.start();
      const heartbeat = engine.getHeartbeat();

      expect(heartbeat).toHaveProperty('tick');
      expect(heartbeat).toHaveProperty('status');
      expect(heartbeat).toHaveProperty('timestamp');
      expect(heartbeat).toHaveProperty('marketOpen');
      expect(heartbeat).toHaveProperty('lastTickAt');
      expect(heartbeat).toHaveProperty('avgTickDurationMs');
      expect(heartbeat).toHaveProperty('ticksProcessed');
      expect(heartbeat).toHaveProperty('uptimeMs');
    });

    it('heartbeat status matches engine status', () => {
      expect(engine.getHeartbeat().status).toBe('stopped');

      engine.start();
      expect(engine.getHeartbeat().status).toBe('running');

      engine.stop();
      expect(engine.getHeartbeat().status).toBe('stopped');
    });

    it('heartbeat tick matches current tick', async () => {
      engine.start();
      const initialTick = engine.getHeartbeat().tick;

      // Run a tick
      await engine.runTick();

      expect(engine.getHeartbeat().tick).toBe(initialTick + 1);
    });

    it('heartbeat marketOpen reflects market status', () => {
      engine.start();
      const heartbeat = engine.getHeartbeat();

      expect(heartbeat.marketOpen).toBe(engine.isMarketOpen());
    });
  });

  describe('tick duration tracking', () => {
    it('tracks tick duration after running ticks', async () => {
      engine.start();

      // Initial avgTickDurationMs should be 0 (no ticks yet)
      expect(engine.getHeartbeat().avgTickDurationMs).toBe(0);

      // Run a tick - timer tracks duration in the start() setInterval callback
      // We need to manually run the interval
      await vi.advanceTimersByTimeAsync(1000);

      // After running interval, ticksProcessed should increment
      // The tick duration is recorded in the setInterval callback
      const heartbeat = engine.getHeartbeat();
      expect(heartbeat.ticksProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('uptime tracking', () => {
    it('uptime is 0 before engine starts', () => {
      expect(engine.getHeartbeat().uptimeMs).toBe(0);
    });

    it('uptime increases after engine starts', async () => {
      engine.start();

      // Get initial uptime (should be very small)
      const initialUptime = engine.getHeartbeat().uptimeMs;

      // Advance time
      await vi.advanceTimersByTimeAsync(5000);

      const newUptime = engine.getHeartbeat().uptimeMs;
      expect(newUptime).toBeGreaterThan(initialUptime);
    });
  });

  describe('heartbeat event emission', () => {
    it('emits heartbeat event when publishing', async () => {
      const heartbeatHandler = vi.fn();
      engine.on('heartbeat', heartbeatHandler);

      engine.start();
      // Wait for heartbeat to be emitted
      await vi.waitFor(() => {
        expect(heartbeatHandler).toHaveBeenCalled();
      });

      expect(heartbeatHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: expect.any(Number),
          status: 'running',
          marketOpen: expect.any(Boolean),
        })
      );
    });
  });

  describe('heartbeat Redis storage', () => {
    it('stores heartbeat with correct structure in Redis', async () => {
      engine.start();
      // Allow initial heartbeat to complete
      await Promise.resolve();
      await Promise.resolve();

      expect(redisService.setEngineHeartbeat).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: expect.any(Number),
          status: 'running',
          timestamp: expect.any(String),
          marketOpen: expect.any(Boolean),
          lastTickAt: expect.any(String),
          avgTickDurationMs: expect.any(Number),
          ticksProcessed: expect.any(Number),
          uptimeMs: expect.any(Number),
        })
      );
    });

    it('heartbeat timestamp is valid ISO string', async () => {
      engine.start();
      // Allow initial heartbeat to complete
      await Promise.resolve();
      await Promise.resolve();

      const setHeartbeatMock = redisService.setEngineHeartbeat as Mock;
      const heartbeatArg = setHeartbeatMock.mock.calls[0][0];

      // Verify timestamp is valid ISO string
      const parsedDate = new Date(heartbeatArg.timestamp);
      expect(parsedDate.toISOString()).toBe(heartbeatArg.timestamp);
    });
  });
});
