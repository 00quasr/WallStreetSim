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
    AGENT_UPDATES: (agentId: string) => `channel:agent:${agentId}`,
    SYMBOL_UPDATES: (symbol: string) => `channel:market:${symbol}`,
  },
}));

vi.mock('../services/webhook', () => ({
  dispatchWebhooks: vi.fn().mockResolvedValue([]),
}));

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';

describe('Agent Holdings and Cash Balance Updates', () => {
  let engine: TickEngine;

  beforeEach(async () => {
    vi.clearAllMocks();

    engine = new TickEngine({
      tickIntervalMs: 1000,
      enableEvents: false,
      eventChance: 0,
    });

    await engine.initialize();

    // Clear market maker's initial liquidity so tests can control the order book
    engine.getMarketEngine().clearAll();
  });

  describe('Buyer cash and holdings updates', () => {
    it('decreases buyer cash by trade value when buying shares', async () => {
      // Add sell order to book
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

      // Add matching buy order
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

      const expectedTradeValue = 100 * 150; // quantity * price = 15000

      // Verify buyer's cash decreased
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-buyer', -expectedTradeValue);
    });

    it('increases buyer holdings when buying shares', async () => {
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '200.00',
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
        price: '200.00',
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

      // Verify buyer's holdings increased with positive quantity delta
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-buyer',
        'AAPL',
        50, // positive quantity delta
        200.00 // average cost equals trade price for new position
      );
    });
  });

  describe('Seller cash and holdings updates', () => {
    it('increases seller cash by trade value when selling shares', async () => {
      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 75,
        price: '180.00',
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
        quantity: 75,
        price: '180.00',
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

      const expectedTradeValue = 75 * 180; // 13500

      // Verify seller's cash increased
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-seller', expectedTradeValue);
    });

    it('decreases seller holdings when selling shares', async () => {
      // Mock seller's existing holding
      (dbService.getHolding as Mock).mockResolvedValue({
        id: 'holding-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        quantity: 200,
        averageCost: '120.0000',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 100,
        price: '160.00',
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
        price: '160.00',
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

      // Verify seller's holdings decreased with negative quantity delta
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-seller',
        'AAPL',
        -100, // negative quantity delta
        120 // average cost preserved when selling
      );
    });
  });

  describe('Average cost calculation', () => {
    it('calculates weighted average cost when buying additional shares', async () => {
      // Agent already has 100 shares at $100 average cost
      (dbService.getHolding as Mock).mockResolvedValue({
        id: 'holding-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: '100.0000',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 100,
        price: '200.00',
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
        price: '200.00',
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

      // Current value: 100 shares * $100 = $10,000
      // New purchase: 100 shares * $200 = $20,000
      // New total: 200 shares, $30,000 value
      // New average cost: $30,000 / 200 = $150
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-buyer',
        'AAPL',
        100,
        150 // weighted average cost
      );
    });

    it('preserves average cost when selling shares', async () => {
      // Agent has 100 shares at $150 average cost
      (dbService.getHolding as Mock).mockResolvedValue({
        id: 'holding-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        quantity: 100,
        averageCost: '150.0000',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '200.00',
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
        price: '200.00',
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

      // Average cost should be preserved at $150 when selling
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-seller',
        'AAPL',
        -50,
        150 // average cost preserved
      );
    });
  });

  describe('Multiple trades in one tick', () => {
    it('updates both buyer and seller for each trade', async () => {
      // Reset getHolding to return null (no existing positions - short selling)
      (dbService.getHolding as Mock).mockResolvedValue(null);

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

      // Both cash updates should have been called
      expect(dbService.updateAgentCash).toHaveBeenCalledTimes(2);
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-buyer', -tradeValue);
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-seller', tradeValue);

      // Both holding updates should have been called
      expect(dbService.updateHolding).toHaveBeenCalledTimes(2);
      expect(dbService.updateHolding).toHaveBeenCalledWith('agent-buyer', 'AAPL', 100, 150);
      expect(dbService.updateHolding).toHaveBeenCalledWith('agent-seller', 'AAPL', -100, expect.any(Number));
    });
  });

  describe('Partial fill balance updates', () => {
    it('updates balances only for the filled quantity', async () => {
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

      // Buy order for 100 shares (will only fill 50)
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

      // Should only update for 50 shares traded
      const partialTradeValue = 50 * 150; // 7500

      // Cash updates for 50 shares only
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-buyer', -partialTradeValue);
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-seller', partialTradeValue);

      // Holding updates for 50 shares only
      expect(dbService.updateHolding).toHaveBeenCalledWith('agent-buyer', 'AAPL', 50, 150);
      expect(dbService.updateHolding).toHaveBeenCalledWith('agent-seller', 'AAPL', -50, expect.any(Number));
    });
  });

  describe('Trade value calculation', () => {
    it('calculates trade value correctly at different price points', async () => {
      const testCases = [
        { quantity: 100, price: '150.00', expectedValue: 15000 },
        { quantity: 1, price: '1000.00', expectedValue: 1000 },
        { quantity: 500, price: '25.50', expectedValue: 12750 },
        { quantity: 10, price: '99.99', expectedValue: 999.9 },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();

        // Reinitialize engine for each test
        engine = new TickEngine({
          tickIntervalMs: 1000,
          enableEvents: false,
          eventChance: 0,
        });
        await engine.initialize();

        // Clear market maker's initial liquidity so test can control the order book
        engine.getMarketEngine().clearAll();

        const sellOrder = {
          id: 'sell-order-1',
          agentId: 'agent-seller',
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'LIMIT',
          quantity: testCase.quantity,
          price: testCase.price,
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
          quantity: testCase.quantity,
          price: testCase.price,
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

        expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-buyer', -testCase.expectedValue);
        expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-seller', testCase.expectedValue);
      }
    });
  });

  describe('Short selling scenarios', () => {
    it('allows holdings to become negative for short positions', async () => {
      // Seller has no existing position
      (dbService.getHolding as Mock).mockResolvedValue(null);

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

      // Seller should have -100 shares (short position)
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-seller',
        'AAPL',
        -100, // negative quantity creates short position
        150 // price used as cost basis for short
      );
    });
  });

  describe('Order of operations', () => {
    it('inserts trade before updating positions', async () => {
      const callOrder: string[] = [];

      (dbService.insertTrade as Mock).mockImplementation(() => {
        callOrder.push('insertTrade');
        return Promise.resolve('mock-trade-id');
      });
      (dbService.updateHolding as Mock).mockImplementation(() => {
        callOrder.push('updateHolding');
        return Promise.resolve(undefined);
      });
      (dbService.updateAgentCash as Mock).mockImplementation(() => {
        callOrder.push('updateAgentCash');
        return Promise.resolve(undefined);
      });

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

      // insertTrade should be called first, then position updates
      expect(callOrder[0]).toBe('insertTrade');
      expect(callOrder.slice(1)).toContain('updateHolding');
      expect(callOrder.slice(1)).toContain('updateAgentCash');
    });
  });
});
