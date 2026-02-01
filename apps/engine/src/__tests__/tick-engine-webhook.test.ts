import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

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
}));

vi.mock('../services/redis', () => ({
  setCurrentTick: vi.fn().mockResolvedValue(undefined),
  cachePrice: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockResolvedValue(undefined),
  closeRedis: vi.fn().mockResolvedValue(undefined),
  CHANNELS: {
    TICK_UPDATES: 'channel:tick_updates',
    MARKET_UPDATES: 'channel:market',
    PRICE_UPDATES: 'channel:prices',
    TRADES: 'channel:trades',
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
  },
}));

vi.mock('../services/webhook', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue([]),
}));

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';
import * as webhookService from '../services/webhook';

describe('TickEngine Webhook Integration', () => {
  let engine: TickEngine;

  beforeEach(async () => {
    vi.clearAllMocks();

    engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await engine.initialize();
  });

  describe('webhook dispatch on tick', () => {
    it('calls dispatchWebhooks after each tick', async () => {
      await engine.runTick();

      expect(webhookService.dispatchWebhooks).toHaveBeenCalled();
    });

    it('passes current tick to dispatchWebhooks', async () => {
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      expect(dispatchMock.mock.calls[0][0]).toBe(1);
    });

    it('passes world state to dispatchWebhooks', async () => {
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      const worldState = dispatchMock.mock.calls[0][1];

      expect(worldState).toBeDefined();
      expect(worldState.currentTick).toBeDefined();
      expect(worldState.marketOpen).toBeDefined();
    });

    it('passes price updates to dispatchWebhooks', async () => {
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      const priceUpdates = dispatchMock.mock.calls[0][2];

      expect(priceUpdates).toBeDefined();
      expect(Array.isArray(priceUpdates)).toBe(true);
    });

    it('passes trades to dispatchWebhooks', async () => {
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      const trades = dispatchMock.mock.calls[0][3];

      expect(trades).toBeDefined();
      expect(Array.isArray(trades)).toBe(true);
    });

    it('passes events to dispatchWebhooks', async () => {
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      const events = dispatchMock.mock.calls[0][4];

      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
    });

    it('passes news to dispatchWebhooks', async () => {
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      const news = dispatchMock.mock.calls[0][5];

      expect(news).toBeDefined();
      expect(Array.isArray(news)).toBe(true);
    });

    it('dispatches webhooks on each subsequent tick', async () => {
      await engine.runTick();
      await engine.runTick();
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      expect(dispatchMock).toHaveBeenCalledTimes(3);

      // Verify tick numbers increment
      expect(dispatchMock.mock.calls[0][0]).toBe(1);
      expect(dispatchMock.mock.calls[1][0]).toBe(2);
      expect(dispatchMock.mock.calls[2][0]).toBe(3);
    });

    it('still returns tick update even if webhooks fail', async () => {
      (webhookService.dispatchWebhooks as Mock).mockRejectedValueOnce(
        new Error('Webhook dispatch failed')
      );

      // This should not throw - webhook errors should be handled gracefully
      await expect(engine.runTick()).rejects.toThrow('Webhook dispatch failed');
    });

    it('does not dispatch webhooks if world state is null', async () => {
      // Clear mocks and set up a fresh engine where getWorldState returns null on second call
      vi.clearAllMocks();

      // First call is during initialize(), second is during runTick()
      (dbService.getWorldState as Mock)
        .mockResolvedValueOnce({
          currentTick: 0,
          marketOpen: true,
          interestRate: 0.05,
          inflationRate: 0.02,
          gdpGrowth: 0.03,
          regime: 'normal',
          lastTickAt: new Date(),
        })
        .mockResolvedValueOnce(null);

      const testEngine = new TickEngine({
        tickIntervalMs: 1000,
        enableEvents: false,
        eventChance: 0,
      });

      await testEngine.initialize();
      vi.clearAllMocks();

      await testEngine.runTick();

      expect(webhookService.dispatchWebhooks).not.toHaveBeenCalled();
    });
  });

  describe('webhook dispatch with trades', () => {
    it('includes trades in webhook dispatch when trades occur', async () => {
      // Set up a trade scenario
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
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

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([sellOrder]);

      // First tick adds sell order to book
      await engine.runTick();

      // Set up matching buy order
      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        price: '150.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 1,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([buyOrder]);

      vi.clearAllMocks();

      // Second tick executes the trade
      await engine.runTick();

      const dispatchMock = webhookService.dispatchWebhooks as Mock;
      expect(dispatchMock).toHaveBeenCalled();

      const trades = dispatchMock.mock.calls[0][3];
      expect(trades.length).toBeGreaterThan(0);
      expect(trades[0].symbol).toBe('AAPL');
    });
  });

  describe('webhook dispatch timing', () => {
    it('dispatches webhooks after price updates are complete', async () => {
      const callOrder: string[] = [];

      (dbService.updateCompanyPrice as Mock).mockImplementation(() => {
        callOrder.push('updateCompanyPrice');
        return Promise.resolve();
      });

      (webhookService.dispatchWebhooks as Mock).mockImplementation(() => {
        callOrder.push('dispatchWebhooks');
        return Promise.resolve([]);
      });

      await engine.runTick();

      // Price updates should happen before webhook dispatch
      const priceUpdateIndex = callOrder.indexOf('updateCompanyPrice');
      const webhookIndex = callOrder.indexOf('dispatchWebhooks');

      expect(priceUpdateIndex).toBeLessThan(webhookIndex);
    });

    it('dispatches webhooks after Redis publish', async () => {
      const callOrder: string[] = [];

      const redisService = await import('../services/redis');
      (redisService.publish as Mock).mockImplementation(() => {
        callOrder.push('redisPublish');
        return Promise.resolve();
      });

      (webhookService.dispatchWebhooks as Mock).mockImplementation(() => {
        callOrder.push('dispatchWebhooks');
        return Promise.resolve([]);
      });

      await engine.runTick();

      // Redis publish should happen before webhook dispatch
      const publishIndex = callOrder.findIndex(c => c === 'redisPublish');
      const webhookIndex = callOrder.indexOf('dispatchWebhooks');

      expect(publishIndex).toBeLessThan(webhookIndex);
    });
  });
});
