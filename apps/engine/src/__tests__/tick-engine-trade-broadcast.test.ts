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
    TRADES: 'channel:trades',
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
  },
}));

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';
import * as redisService from '../services/redis';

describe('TickEngine Trade Broadcasting', () => {
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

  // Helper to set up a trade scenario - adds a sell order on tick 1, then a matching buy on tick 2
  async function setupAndExecuteTrade(): Promise<{ publishMock: Mock }> {
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

    // First tick processes the sell order (adds to book)
    await engine.runTick();

    // Set up matching buy order for second tick
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

    // Clear mocks before the trade tick so we only see trade-related publishes
    vi.clearAllMocks();
    const publishMock = redisService.publish as Mock;

    // Second tick executes the trade
    await engine.runTick();

    return { publishMock };
  }

  describe('trade broadcast to trades channel', () => {
    it('publishes TRADE message to TRADES channel when trades occur', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      // Find the TRADES channel call
      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();
      expect(tradesCall![1].type).toBe('TRADE');
    });

    it('TRADE message includes tick number', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();
      expect(tradesCall![1].payload.tick).toBe(2);
    });

    it('TRADE message includes array of trades', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();
      expect(tradesCall![1].payload.trades).toBeDefined();
      expect(Array.isArray(tradesCall![1].payload.trades)).toBe(true);
      expect(tradesCall![1].payload.trades.length).toBeGreaterThan(0);
    });

    it('each trade includes required fields', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();

      for (const trade of tradesCall![1].payload.trades) {
        expect(trade).toHaveProperty('id');
        expect(trade).toHaveProperty('symbol');
        expect(trade).toHaveProperty('price');
        expect(trade).toHaveProperty('quantity');
        expect(trade).toHaveProperty('buyerId');
        expect(trade).toHaveProperty('sellerId');
        expect(trade).toHaveProperty('tick');
      }
    });

    it('TRADE message has ISO timestamp', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();
      expect(tradesCall![1].timestamp).toBeDefined();

      // Verify it's a valid ISO timestamp
      const parsedDate = new Date(tradesCall![1].timestamp);
      expect(parsedDate.toISOString()).toBe(tradesCall![1].timestamp);
    });

    it('does not publish to TRADES channel when no trades occur', async () => {
      const publishMock = redisService.publish as Mock;

      // Run a tick without any pending orders - no trades will occur
      await engine.runTick();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeUndefined();
    });
  });

  describe('trade broadcast to symbol-specific channels', () => {
    it('publishes TRADE message to market:SYMBOL channel', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      // Find AAPL symbol trade update
      const aaplTradeCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:AAPL' && call[1].type === 'TRADE'
      );

      expect(aaplTradeCall).toBeDefined();
    });

    it('symbol-specific TRADE message includes trade details', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const aaplTradeCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:AAPL' && call[1].type === 'TRADE'
      );

      expect(aaplTradeCall).toBeDefined();

      const tradeMessage = aaplTradeCall![1];
      expect(tradeMessage.type).toBe('TRADE');
      expect(tradeMessage.payload.symbol).toBe('AAPL');
      expect(tradeMessage.payload).toHaveProperty('id');
      expect(tradeMessage.payload).toHaveProperty('price');
      expect(tradeMessage.payload).toHaveProperty('quantity');
      expect(tradeMessage.payload).toHaveProperty('buyerId');
      expect(tradeMessage.payload).toHaveProperty('sellerId');
      expect(tradeMessage.payload).toHaveProperty('tick');
      expect(tradeMessage.timestamp).toBeDefined();
    });

    it('publishes separate TRADE messages for multiple symbol trades', async () => {
      // Set up AAPL sell order
      const aaplSellOrder = {
        id: 'sell-order-aapl',
        agentId: 'agent-seller-1',
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

      // Set up GOOG sell order
      const googSellOrder = {
        id: 'sell-order-goog',
        agentId: 'agent-seller-2',
        symbol: 'GOOG',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '2800.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL', 'GOOG']);
      (dbService.getPendingOrders as Mock)
        .mockResolvedValueOnce([aaplSellOrder])
        .mockResolvedValueOnce([googSellOrder]);

      // First tick adds sell orders to book
      await engine.runTick();

      // Set up matching buy orders
      const aaplBuyOrder = {
        id: 'buy-order-aapl',
        agentId: 'agent-buyer-1',
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

      const googBuyOrder = {
        id: 'buy-order-goog',
        agentId: 'agent-buyer-2',
        symbol: 'GOOG',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 50,
        price: '2800.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 1,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL', 'GOOG']);
      (dbService.getPendingOrders as Mock)
        .mockResolvedValueOnce([aaplBuyOrder])
        .mockResolvedValueOnce([googBuyOrder]);

      vi.clearAllMocks();
      const publishMock = redisService.publish as Mock;

      // Second tick executes both trades
      await engine.runTick();

      // Find AAPL symbol trade update
      const aaplTradeCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:AAPL' && call[1].type === 'TRADE'
      );

      // Find GOOG symbol trade update
      const googTradeCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:GOOG' && call[1].type === 'TRADE'
      );

      expect(aaplTradeCall).toBeDefined();
      expect(googTradeCall).toBeDefined();

      expect(aaplTradeCall![1].payload.symbol).toBe('AAPL');
      expect(googTradeCall![1].payload.symbol).toBe('GOOG');
    });

    it('does not publish symbol-specific TRADE when no trades for that symbol', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      // GOOG should not have a TRADE message (only AAPL has trades)
      const googTradeCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:GOOG' && call[1].type === 'TRADE'
      );

      expect(googTradeCall).toBeUndefined();
    });
  });

  describe('trade broadcast structure compliance', () => {
    it('TRADE message structure for trades channel', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();

      const message = tradesCall![1];

      // WSTrade-like interface structure:
      // type: 'TRADE'
      // payload: { tick: number, trades: Trade[] }
      // timestamp: string

      expect(message).toMatchObject({
        type: 'TRADE',
        payload: {
          tick: expect.any(Number),
          trades: expect.any(Array),
        },
        timestamp: expect.any(String),
      });

      // Each trade object should have required fields
      for (const trade of message.payload.trades) {
        expect(Object.keys(trade)).toEqual(
          expect.arrayContaining(['id', 'symbol', 'price', 'quantity', 'buyerId', 'sellerId', 'tick'])
        );
      }
    });

    it('TRADE message structure for symbol-specific channel', async () => {
      const { publishMock } = await setupAndExecuteTrade();

      const symbolTradeCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:market:AAPL' && call[1].type === 'TRADE'
      );

      expect(symbolTradeCall).toBeDefined();

      const message = symbolTradeCall![1];

      // Single trade structure for symbol-specific channel
      expect(message).toMatchObject({
        type: 'TRADE',
        payload: {
          id: expect.any(String),
          symbol: 'AAPL',
          price: expect.any(Number),
          quantity: expect.any(Number),
          buyerId: expect.any(String),
          sellerId: expect.any(String),
          tick: expect.any(Number),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('trades included in tick update', () => {
    it('tick update still includes trades array', async () => {
      // Set up sell order
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

      const tickUpdate = await engine.runTick();

      expect(tickUpdate.trades).toBeDefined();
      expect(Array.isArray(tickUpdate.trades)).toBe(true);
      expect(tickUpdate.trades.length).toBeGreaterThan(0);
    });

    it('trades in tick update match trades in dedicated channel', async () => {
      // Set up sell order
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
      const publishMock = redisService.publish as Mock;

      const tickUpdate = await engine.runTick();

      const tradesCall = publishMock.mock.calls.find(
        call => call[0] === 'channel:trades'
      );

      expect(tradesCall).toBeDefined();

      // Number of trades should match
      expect(tradesCall![1].payload.trades.length).toBe(tickUpdate.trades.length);

      // Verify trade data matches
      for (let i = 0; i < tickUpdate.trades.length; i++) {
        expect(tradesCall![1].payload.trades[i].symbol).toBe(tickUpdate.trades[i].symbol);
        expect(tradesCall![1].payload.trades[i].price).toBe(tickUpdate.trades[i].price);
        expect(tradesCall![1].payload.trades[i].quantity).toBe(tickUpdate.trades[i].quantity);
      }
    });
  });
});
