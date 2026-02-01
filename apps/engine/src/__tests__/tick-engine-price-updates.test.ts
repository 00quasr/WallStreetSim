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
    {
      id: 'company-2',
      symbol: 'GOOG',
      name: 'Alphabet Inc.',
      sector: 'technology',
      industry: 'Internet Services',
      price: 2800.00,
      previousClose: 2790.00,
      open: 2795.00,
      high: 2810.00,
      low: 2785.00,
      sharesOutstanding: 500000,
      marketCap: 1400000000,
      revenue: 200000000,
      profit: 50000000,
      cash: 100000000,
      debt: 20000000,
      peRatio: 28,
      volatility: 0.025,
      beta: 1.2,
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
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
  },
}));

vi.mock('../services/webhook', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue([]),
}));

import { TickEngine } from '../tick-engine';
import * as redisService from '../services/redis';

describe('TickEngine Price Updates', () => {
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

  describe('price update broadcasting', () => {
    it('publishes tick update with price updates to TICK_UPDATES channel', async () => {
      const tickUpdate = await engine.runTick();

      expect(redisService.publish).toHaveBeenCalledWith(
        'channel:tick_updates',
        expect.objectContaining({
          tick: 1,
          priceUpdates: expect.arrayContaining([
            expect.objectContaining({
              symbol: expect.any(String),
              newPrice: expect.any(Number),
              change: expect.any(Number),
              changePercent: expect.any(Number),
              volume: expect.any(Number),
            }),
          ]),
        })
      );

      // Verify the tick update has price updates for all companies
      expect(tickUpdate.priceUpdates.length).toBe(2);
    });

    it('publishes dedicated PRICE_UPDATE to PRICE_UPDATES channel', async () => {
      await engine.runTick();

      expect(redisService.publish).toHaveBeenCalledWith(
        'channel:prices',
        expect.objectContaining({
          type: 'PRICE_UPDATE',
          payload: expect.objectContaining({
            tick: 1,
            prices: expect.arrayContaining([
              expect.objectContaining({
                symbol: expect.any(String),
                price: expect.any(Number),
                change: expect.any(Number),
                changePercent: expect.any(Number),
                volume: expect.any(Number),
              }),
            ]),
          }),
          timestamp: expect.any(String),
        })
      );
    });

    it('price update includes all required fields: symbol, price, change, changePercent', async () => {
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      // Find the PRICE_UPDATES call
      const priceUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:prices'
      );

      expect(priceUpdateCall).toBeDefined();

      const priceUpdateMessage = priceUpdateCall![1];
      expect(priceUpdateMessage.type).toBe('PRICE_UPDATE');
      expect(priceUpdateMessage.payload.tick).toBe(1);

      // Check each price in the payload
      for (const priceData of priceUpdateMessage.payload.prices) {
        expect(priceData).toHaveProperty('symbol');
        expect(priceData).toHaveProperty('price');
        expect(priceData).toHaveProperty('change');
        expect(priceData).toHaveProperty('changePercent');
        expect(priceData).toHaveProperty('volume');

        expect(typeof priceData.symbol).toBe('string');
        expect(typeof priceData.price).toBe('number');
        expect(typeof priceData.change).toBe('number');
        expect(typeof priceData.changePercent).toBe('number');
        expect(typeof priceData.volume).toBe('number');
      }
    });

    it('publishes per-symbol MARKET_UPDATE to symbol-specific channels', async () => {
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      // Find AAPL symbol update
      const aaplUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:AAPL'
      );

      expect(aaplUpdateCall).toBeDefined();

      const aaplMessage = aaplUpdateCall![1];
      expect(aaplMessage.type).toBe('MARKET_UPDATE');
      expect(aaplMessage.payload.symbol).toBe('AAPL');
      expect(aaplMessage.payload).toHaveProperty('price');
      expect(aaplMessage.payload).toHaveProperty('change');
      expect(aaplMessage.payload).toHaveProperty('changePercent');
      expect(aaplMessage.payload).toHaveProperty('volume');

      // Find GOOG symbol update
      const googUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:GOOG'
      );

      expect(googUpdateCall).toBeDefined();

      const googMessage = googUpdateCall![1];
      expect(googMessage.type).toBe('MARKET_UPDATE');
      expect(googMessage.payload.symbol).toBe('GOOG');
    });

    it('price update message has ISO timestamp', async () => {
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      const priceUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:prices'
      );

      expect(priceUpdateCall).toBeDefined();

      const priceUpdateMessage = priceUpdateCall![1];
      expect(priceUpdateMessage.timestamp).toBeDefined();

      // Verify it's a valid ISO timestamp
      const parsedDate = new Date(priceUpdateMessage.timestamp);
      expect(parsedDate.toISOString()).toBe(priceUpdateMessage.timestamp);
    });

    it('publishes updates for all companies each tick', async () => {
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      // Should have called publish for:
      // 1. TICK_UPDATES channel
      // 2. PRICE_UPDATES channel
      // 3. AAPL symbol channel
      // 4. GOOG symbol channel
      expect(publishMock).toHaveBeenCalledTimes(4);

      // Verify PRICE_UPDATES has both symbols
      const priceUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:prices'
      );
      const symbols = priceUpdateCall![1].payload.prices.map(
        (p: { symbol: string }) => p.symbol
      );
      expect(symbols).toContain('AAPL');
      expect(symbols).toContain('GOOG');
    });

    it('consecutive ticks publish updated prices', async () => {
      const publishMock = redisService.publish as Mock;

      // Run first tick
      const tickUpdate1 = await engine.runTick();

      // Clear mocks
      vi.clearAllMocks();

      // Run second tick
      const tickUpdate2 = await engine.runTick();

      // Verify tick increments
      expect(tickUpdate1.tick).toBe(1);
      expect(tickUpdate2.tick).toBe(2);

      // Verify second tick published price updates
      const priceUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:prices'
      );
      expect(priceUpdateCall).toBeDefined();
      expect(priceUpdateCall![1].payload.tick).toBe(2);
    });

    it('emits tick event with price updates', async () => {
      let emittedTickUpdate: unknown = null;

      engine.on('tick', (tickUpdate) => {
        emittedTickUpdate = tickUpdate;
      });

      await engine.runTick();

      expect(emittedTickUpdate).not.toBeNull();
      expect(emittedTickUpdate).toHaveProperty('tick', 1);
      expect(emittedTickUpdate).toHaveProperty('priceUpdates');
      expect((emittedTickUpdate as { priceUpdates: unknown[] }).priceUpdates.length).toBe(2);
    });

    it('price updates include change calculated from previous price', async () => {
      const tickUpdate = await engine.runTick();

      // AAPL starts at 150.00 with previousClose of 149.00
      const aaplUpdate = tickUpdate.priceUpdates.find(u => u.symbol === 'AAPL');
      expect(aaplUpdate).toBeDefined();

      // Change should be newPrice - oldPrice (use toBeCloseTo for floating point)
      const expectedChange = aaplUpdate!.newPrice - aaplUpdate!.oldPrice;
      expect(aaplUpdate!.change).toBeCloseTo(expectedChange, 10);

      // Change percent should be (change / oldPrice) * 100
      // Note: changePercent is rounded to 2 decimal places in price-engine.ts:134
      const expectedChangePercent = (aaplUpdate!.change / aaplUpdate!.oldPrice) * 100;
      expect(aaplUpdate!.changePercent).toBeCloseTo(expectedChangePercent, 1);
    });
  });

  describe('price update structure compliance', () => {
    it('WSPriceUpdate structure matches types/api.ts specification', async () => {
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      const priceUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:prices'
      );

      const message = priceUpdateCall![1];

      // WSPriceUpdate interface structure:
      // type: 'PRICE_UPDATE'
      // payload: { tick: number, prices: { symbol, price, change, changePercent, volume }[] }
      // timestamp: string

      expect(message).toMatchObject({
        type: 'PRICE_UPDATE',
        payload: {
          tick: expect.any(Number),
          prices: expect.any(Array),
        },
        timestamp: expect.any(String),
      });

      // Each price object should match the structure
      for (const price of message.payload.prices) {
        expect(Object.keys(price).sort()).toEqual(
          ['change', 'changePercent', 'price', 'symbol', 'volume'].sort()
        );
      }
    });

    it('WSMarketUpdate structure matches types/api.ts specification', async () => {
      const publishMock = redisService.publish as Mock;

      await engine.runTick();

      const symbolUpdateCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:AAPL'
      );

      const message = symbolUpdateCall![1];

      // WSMarketUpdate interface structure:
      // type: 'MARKET_UPDATE'
      // payload: { symbol, price, change, changePercent, volume }
      // timestamp: string

      expect(message).toMatchObject({
        type: 'MARKET_UPDATE',
        payload: {
          symbol: 'AAPL',
          price: expect.any(Number),
          change: expect.any(Number),
          changePercent: expect.any(Number),
          volume: expect.any(Number),
        },
        timestamp: expect.any(String),
      });
    });
  });
});
