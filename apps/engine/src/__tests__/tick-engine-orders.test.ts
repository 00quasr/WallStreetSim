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

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';
import * as redisService from '../services/redis';

describe('TickEngine Order Processing', () => {
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

  describe('processOrders during tick', () => {
    it('processes pending orders each tick when market is open', async () => {
      const pendingOrders = [
        {
          id: 'order-1',
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
          tickSubmitted: 0,
          tickFilled: null,
          createdAt: new Date(),
        },
      ];

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValue(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValue(pendingOrders);

      const tickUpdate = await engine.runTick();

      expect(dbService.getSymbolsWithPendingOrders).toHaveBeenCalled();
      expect(dbService.getPendingOrders).toHaveBeenCalledWith('AAPL');
    });

    it('matches buy and sell orders and generates trades', async () => {
      // First tick: Add a sell order to the book
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

      // Second tick: Add a matching buy order
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

      // Should have generated a trade
      expect(tickUpdate.trades).toHaveLength(1);
      expect(tickUpdate.trades[0].symbol).toBe('AAPL');
      expect(tickUpdate.trades[0].quantity).toBe(100);
      expect(tickUpdate.trades[0].price).toBe(150.00);
      expect(tickUpdate.trades[0].buyerId).toBe('agent-buyer');
      expect(tickUpdate.trades[0].sellerId).toBe('agent-seller');
    });

    it('persists trades to database', async () => {
      // Set up matching orders
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
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

      const buyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 50,
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
      await engine.runTick();

      expect(dbService.insertTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: 2,
          symbol: 'AAPL',
          buyerId: 'agent-buyer',
          sellerId: 'agent-seller',
          buyerOrderId: 'buy-order-1',
          sellerOrderId: 'sell-order-1',
          price: 150.00,
          quantity: 50,
        })
      );
    });

    it('updates order status after fill', async () => {
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
      await engine.runTick();

      // Verify order status was updated to 'filled'
      expect(dbService.updateOrderStatus).toHaveBeenCalledWith(
        'buy-order-1',
        'filled',
        100,
        150.00,
        2 // tick filled
      );
    });

    it('updates agent holdings after trade', async () => {
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
      await engine.runTick();

      // Buyer gets shares added
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-buyer',
        'AAPL',
        100,
        150.00
      );

      // Seller gets shares removed
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-seller',
        'AAPL',
        -100,
        expect.any(Number)
      );
    });

    it('updates agent cash balances after trade', async () => {
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
      await engine.runTick();

      const tradeValue = 100 * 150;

      // Buyer pays cash
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-buyer', -tradeValue);

      // Seller receives cash
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-seller', tradeValue);
    });

    it('handles partial fills correctly', async () => {
      // Sell order for 50 shares
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
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

      // Buy order for 100 shares (will partially fill)
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

      // Trade should be for 50 shares (available liquidity)
      expect(tickUpdate.trades).toHaveLength(1);
      expect(tickUpdate.trades[0].quantity).toBe(50);

      // Order status should be 'partial' since only 50 of 100 filled
      expect(dbService.updateOrderStatus).toHaveBeenCalledWith(
        'buy-order-1',
        'partial',
        50,
        150.00,
        null
      );
    });

    it('processes market orders', async () => {
      // Add a resting limit sell order
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

      // Submit a market buy order
      const marketBuyOrder = {
        id: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 100,
        price: null,
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 1,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([marketBuyOrder]);
      const tickUpdate = await engine.runTick();

      // Market order should fill at the resting limit price
      expect(tickUpdate.trades).toHaveLength(1);
      expect(tickUpdate.trades[0].price).toBe(150.00);
      expect(tickUpdate.trades[0].quantity).toBe(100);
    });

    it('processes multiple symbols in one tick', async () => {
      // Add sell orders for both symbols
      const aaplSellOrder = {
        id: 'sell-aapl',
        agentId: 'agent-seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '150.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      const googSellOrder = {
        id: 'sell-goog',
        agentId: 'agent-seller-2',
        symbol: 'GOOG',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 10,
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
      await engine.runTick();

      // Add matching buy orders for both
      const aaplBuyOrder = {
        id: 'buy-aapl',
        agentId: 'agent-buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 50,
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
        id: 'buy-goog',
        agentId: 'agent-buyer-2',
        symbol: 'GOOG',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 10,
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

      const tickUpdate = await engine.runTick();

      // Should have trades for both symbols
      expect(tickUpdate.trades).toHaveLength(2);

      const aaplTrade = tickUpdate.trades.find(t => t.symbol === 'AAPL');
      const googTrade = tickUpdate.trades.find(t => t.symbol === 'GOOG');

      expect(aaplTrade).toBeDefined();
      expect(aaplTrade?.quantity).toBe(50);
      expect(aaplTrade?.price).toBe(150.00);

      expect(googTrade).toBeDefined();
      expect(googTrade?.quantity).toBe(10);
      expect(googTrade?.price).toBe(2800.00);
    });

    it('publishes tick update with trades to Redis', async () => {
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
      await engine.runTick();

      // Verify tick update was published to Redis
      expect(redisService.publish).toHaveBeenCalledWith(
        'channel:tick_updates',
        expect.objectContaining({
          tick: 2,
          marketOpen: true,
          trades: expect.arrayContaining([
            expect.objectContaining({
              symbol: 'AAPL',
              quantity: 100,
            }),
          ]),
        })
      );
    });
  });

  describe('market closed behavior', () => {
    it('does not process orders when market is closed', async () => {
      // Create engine with market hours that will be closed
      const closedEngine = new TickEngine({
        tickIntervalMs: 1000,
        marketOpenTick: 100, // Market opens at tick 100
        marketCloseTick: 200, // Market closes at tick 200
        enableEvents: false,
        eventChance: 0,
      });

      // Mock to return tick 0 (before market open)
      (dbService.getWorldState as Mock).mockResolvedValueOnce({
        currentTick: 0,
        marketOpen: false,
        interestRate: 0.05,
        inflationRate: 0.02,
        gdpGrowth: 0.03,
        regime: 'normal',
        lastTickAt: new Date(),
      });

      await closedEngine.initialize();

      // Run tick - market should be closed
      const tickUpdate = await closedEngine.runTick();

      // Should not have called getPendingOrders
      expect(dbService.getSymbolsWithPendingOrders).not.toHaveBeenCalled();
      expect(tickUpdate.trades).toHaveLength(0);
      expect(tickUpdate.marketOpen).toBe(false);
    });
  });
});
