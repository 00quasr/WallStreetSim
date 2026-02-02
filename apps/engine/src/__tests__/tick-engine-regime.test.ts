import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock checkpoint service
vi.mock('../checkpoint-service', () => ({
  shouldCheckpointAgents: vi.fn().mockReturnValue(false),
  checkpointAllAgentPortfolios: vi.fn().mockResolvedValue(0),
  shouldSaveFullWorldSnapshot: vi.fn().mockReturnValue(false),
  saveFullWorldSnapshot: vi.fn().mockResolvedValue(undefined),
  recordTickEvents: vi.fn().mockResolvedValue(undefined),
}));

// Mock db service with configurable world state
const mockGetWorldState = vi.fn();
vi.mock('../services/db', () => ({
  getWorldState: () => mockGetWorldState(),
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
  getCurrentSequence: vi.fn().mockResolvedValue(0),
  closeRedis: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  CHANNELS: {
    TICK_UPDATES: 'channel:tick_updates',
    MARKET_UPDATES: 'channel:market',
    PRICE_UPDATES: 'channel:prices',
    NEWS_UPDATES: 'channel:news',
    TRADES: 'channel:trades',
    AGENT_CALLBACK_CONFIRMED: 'channel:agent_callback_confirmed',
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
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
import * as redisService from '../services/redis';
import type { MarketRegime } from '@wallstreetsim/types';

function createMockWorldState(regime: MarketRegime = 'normal') {
  return {
    currentTick: 0,
    marketOpen: true,
    interestRate: 0.05,
    inflationRate: 0.02,
    gdpGrowth: 0.03,
    regime,
    lastTickAt: new Date(),
  };
}

describe('TickEngine Market Regime', () => {
  let engine: TickEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetWorldState.mockResolvedValue(createMockWorldState('normal'));

    engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await engine.initialize();
  });

  describe('regime in tick update', () => {
    it('includes regime from world state in tick update', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('normal'));

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.regime).toBe('normal');
    });

    it('publishes tick update with regime to Redis', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('normal'));
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      const tickUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:tick_updates'
      );

      expect(tickUpdateCall).toBeDefined();
      expect(tickUpdateCall![1].regime).toBe('normal');
    });

    it('handles bull regime', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('bull'));
      const publishMock = redisService.publish as Mock;

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.regime).toBe('bull');

      const tickUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:tick_updates'
      );
      expect(tickUpdateCall![1].regime).toBe('bull');
    });

    it('handles bear regime', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('bear'));
      const publishMock = redisService.publish as Mock;

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.regime).toBe('bear');

      const tickUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:tick_updates'
      );
      expect(tickUpdateCall![1].regime).toBe('bear');
    });

    it('handles crash regime', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('crash'));
      const publishMock = redisService.publish as Mock;

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.regime).toBe('crash');

      const tickUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:tick_updates'
      );
      expect(tickUpdateCall![1].regime).toBe('crash');
    });

    it('handles bubble regime', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('bubble'));
      const publishMock = redisService.publish as Mock;

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.regime).toBe('bubble');

      const tickUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:tick_updates'
      );
      expect(tickUpdateCall![1].regime).toBe('bubble');
    });

    it('defaults to normal when world state is null', async () => {
      mockGetWorldState.mockResolvedValue(null);
      const publishMock = redisService.publish as Mock;

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.regime).toBe('normal');

      const tickUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:tick_updates'
      );
      expect(tickUpdateCall![1].regime).toBe('normal');
    });

    it('emits tick event with correct regime', async () => {
      mockGetWorldState.mockResolvedValue(createMockWorldState('bull'));
      let emittedTickUpdate: unknown = null;

      engine.on('tick', (tickUpdate) => {
        emittedTickUpdate = tickUpdate;
      });

      await engine.runTick();

      expect(emittedTickUpdate).not.toBeNull();
      expect((emittedTickUpdate as { regime: string }).regime).toBe('bull');
    });

    it('regime changes between ticks', async () => {
      // First tick: normal
      mockGetWorldState.mockResolvedValue(createMockWorldState('normal'));
      const tickUpdate1 = await engine.runTick();
      expect(tickUpdate1.regime).toBe('normal');

      // Second tick: bull
      mockGetWorldState.mockResolvedValue(createMockWorldState('bull'));
      const tickUpdate2 = await engine.runTick();
      expect(tickUpdate2.regime).toBe('bull');

      // Third tick: crash
      mockGetWorldState.mockResolvedValue(createMockWorldState('crash'));
      const tickUpdate3 = await engine.runTick();
      expect(tickUpdate3.regime).toBe('crash');
    });
  });

  describe('regime fetching', () => {
    it('fetches world state for regime during tick processing', async () => {
      await engine.runTick();

      // getWorldState should be called at least once during runTick
      expect(mockGetWorldState).toHaveBeenCalled();
    });

    it('uses latest regime value from database', async () => {
      // Initialize with normal
      mockGetWorldState.mockResolvedValue(createMockWorldState('normal'));

      // Before runTick, change the mock to return bull
      mockGetWorldState.mockResolvedValue(createMockWorldState('bull'));

      const tickUpdate = await engine.runTick();

      // Should use the bull regime (latest value)
      expect(tickUpdate.regime).toBe('bull');
    });
  });
});
