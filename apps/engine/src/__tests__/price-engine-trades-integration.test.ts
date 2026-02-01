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
      sector: 'Technology',
      industry: 'Consumer Electronics',
      price: 100.00,
      previousClose: 100.00,
      open: 100.00,
      high: 100.00,
      low: 100.00,
      sharesOutstanding: 10000,
      marketCap: 1000000,
      revenue: 100000,
      profit: 20000,
      cash: 50000,
      debt: 10000,
      peRatio: 25,
      volatility: 0.05,
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
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
  },
}));

vi.mock('../services/webhook', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue([]),
}));

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';

describe('PriceEngine receives non-empty trades array', () => {
  let engine: TickEngine;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create engine with deterministic behavior (no random walk, no sector correlation)
    engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await engine.initialize();
  });

  describe('trades integration with PriceEngine', () => {
    it('passes non-empty trades array to PriceEngine when orders are matched', async () => {
      // Spy on PriceEngine.processTick to verify trades are passed
      const priceEngine = engine.getPriceEngine();
      const processTickSpy = vi.spyOn(priceEngine, 'processTick');

      // First tick: Add a sell order to the book
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 100,
        price: '100.00',
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

      await engine.runTick();

      // Second tick: Add a matching buy order to generate a trade
      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        price: '100.00',
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

      await engine.runTick();

      // Verify that processTick was called with a non-empty trades array
      const secondCall = processTickSpy.mock.calls[1];
      const tradesArg = secondCall[1];

      expect(tradesArg).toBeDefined();
      expect(tradesArg.length).toBeGreaterThan(0);
      expect(tradesArg[0]).toMatchObject({
        symbol: 'AAPL',
        quantity: 100,
        price: 100.00,
        buyerId: 'agent-buyer',
        sellerId: 'agent-seller',
      });
    });

    it('PriceEngine uses trades for agent pressure calculation', async () => {
      // Clear market maker liquidity for this test
      engine.getMarketEngine().clearAll();

      // First tick: Add a sell order at 100
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 1000,
        price: '100.00',
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

      await engine.runTick();

      // Second tick: Large buy trade at higher price (buy pressure)
      // This should create positive agent pressure
      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 1000,
        price: '105.00', // Higher than current price indicates buy aggression
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

      const tickUpdate = await engine.runTick();

      // Find the AAPL price update
      const aaplUpdate = tickUpdate.priceUpdates.find(u => u.symbol === 'AAPL');

      expect(aaplUpdate).toBeDefined();
      // Agent pressure should be non-zero when trades exist
      expect(aaplUpdate!.drivers.agentPressure).not.toBe(0);
    });

    it('PriceEngine calculates volume from trades', async () => {
      // Clear market maker liquidity for this test
      engine.getMarketEngine().clearAll();

      // First tick: Add a sell order
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 250,
        price: '100.00',
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

      await engine.runTick();

      // Second tick: Matching buy order
      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 250,
        price: '100.00',
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

      const tickUpdate = await engine.runTick();

      // Find the AAPL price update
      const aaplUpdate = tickUpdate.priceUpdates.find(u => u.symbol === 'AAPL');

      expect(aaplUpdate).toBeDefined();
      // Volume should equal the traded quantity
      expect(aaplUpdate!.volume).toBe(250);
    });

    it('PriceEngine receives empty trades array when no orders match', async () => {
      const priceEngine = engine.getPriceEngine();
      const processTickSpy = vi.spyOn(priceEngine, 'processTick');

      // No pending orders
      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce([]);

      await engine.runTick();

      // Verify processTick was called with an empty trades array
      const call = processTickSpy.mock.calls[0];
      const tradesArg = call[1];

      expect(tradesArg).toBeDefined();
      expect(tradesArg).toHaveLength(0);
    });

    it('multiple trades in a tick are all passed to PriceEngine', async () => {
      const priceEngine = engine.getPriceEngine();
      const processTickSpy = vi.spyOn(priceEngine, 'processTick');

      // Clear order book for controlled test
      engine.getMarketEngine().clearAll();

      // First tick: Add two sell orders
      const sellOrder1 = {
        id: 'sell-order-1',
        agentId: 'agent-seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '100.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      const sellOrder2 = {
        id: 'sell-order-2',
        agentId: 'agent-seller-2',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '101.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([sellOrder1, sellOrder2]);

      await engine.runTick();

      // Second tick: Large buy order that matches both sells
      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        price: '101.00',
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

      await engine.runTick();

      // Verify that processTick received multiple trades
      const secondCall = processTickSpy.mock.calls[1];
      const tradesArg = secondCall[1];

      expect(tradesArg.length).toBe(2);
      expect(tradesArg[0].quantity).toBe(50);
      expect(tradesArg[0].price).toBe(100.00);
      expect(tradesArg[1].quantity).toBe(50);
      expect(tradesArg[1].price).toBe(101.00);
    });

    it('tick update includes both trades and price updates with agent pressure', async () => {
      // Clear market maker liquidity
      engine.getMarketEngine().clearAll();

      // First tick: Add a sell order
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 500,
        price: '100.00',
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

      await engine.runTick();

      // Second tick: Matching buy order
      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 500,
        price: '100.00',
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

      const tickUpdate = await engine.runTick();

      // Verify tick update structure
      expect(tickUpdate.trades).toHaveLength(1);
      expect(tickUpdate.trades[0].symbol).toBe('AAPL');
      expect(tickUpdate.trades[0].quantity).toBe(500);

      expect(tickUpdate.priceUpdates).toBeDefined();
      const aaplUpdate = tickUpdate.priceUpdates.find(u => u.symbol === 'AAPL');
      expect(aaplUpdate).toBeDefined();
      expect(aaplUpdate!.drivers).toBeDefined();
      expect(aaplUpdate!.volume).toBe(500);
    });
  });
});
