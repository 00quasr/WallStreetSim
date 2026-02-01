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

import { TickEngine } from '../tick-engine';
import * as dbService from '../services/db';

describe('Holdings Table Updates', () => {
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

  describe('New position creation', () => {
    it('creates a new holding when buying shares with no existing position', async () => {
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

      // Agent has no existing holding
      (dbService.getHolding as Mock).mockResolvedValue(null);

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

      // Verify new holding is created with correct quantity and average cost
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-buyer',
        'AAPL',
        100, // positive quantity for buy
        150 // average cost equals trade price for new position
      );
    });
  });

  describe('Position closing', () => {
    it('deletes holding record when position is fully closed', async () => {
      // Seller has exactly 100 shares
      (dbService.getHolding as Mock).mockImplementation((agentId, symbol) => {
        if (agentId === 'agent-seller' && symbol === 'AAPL') {
          return Promise.resolve({
            id: 'holding-1',
            agentId: 'agent-seller',
            symbol: 'AAPL',
            quantity: 100,
            averageCost: '120.0000',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
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

      // Verify holding was deleted when position fully closed
      expect(dbService.deleteHolding).toHaveBeenCalledWith('agent-seller', 'AAPL');
    });

    it('updates holding record when position is partially closed', async () => {
      // Seller has 200 shares
      (dbService.getHolding as Mock).mockImplementation((agentId, symbol) => {
        if (agentId === 'agent-seller' && symbol === 'AAPL') {
          return Promise.resolve({
            id: 'holding-1',
            agentId: 'agent-seller',
            symbol: 'AAPL',
            quantity: 200,
            averageCost: '120.0000',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 100, // Selling only 100 of 200 shares
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

      // Verify holding was updated (not deleted) with negative delta
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-seller',
        'AAPL',
        -100, // negative quantity for partial sell
        120 // average cost preserved
      );
      // Verify deleteHolding was NOT called for seller
      expect(dbService.deleteHolding).not.toHaveBeenCalledWith('agent-seller', 'AAPL');
    });
  });

  describe('Position updates with existing holdings', () => {
    it('calculates correct weighted average cost when adding to position', async () => {
      // Agent has 100 shares at $100 average cost
      (dbService.getHolding as Mock).mockImplementation((agentId, symbol) => {
        if (agentId === 'agent-buyer' && symbol === 'AAPL') {
          return Promise.resolve({
            id: 'holding-1',
            agentId: 'agent-buyer',
            symbol: 'AAPL',
            quantity: 100,
            averageCost: '100.0000',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
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

      // Existing: 100 shares * $100 = $10,000
      // New: 100 shares * $200 = $20,000
      // Total: 200 shares, $30,000 value
      // New avg: $30,000 / 200 = $150
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-buyer',
        'AAPL',
        100,
        150 // weighted average cost
      );
    });

    it('preserves average cost when selling from position', async () => {
      // Agent has 100 shares at $150 average cost
      (dbService.getHolding as Mock).mockImplementation((agentId, symbol) => {
        if (agentId === 'agent-seller' && symbol === 'AAPL') {
          return Promise.resolve({
            id: 'holding-1',
            agentId: 'agent-seller',
            symbol: 'AAPL',
            quantity: 100,
            averageCost: '150.0000',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      const sellOrder = {
        id: 'sell-order-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '200.00', // Selling at profit
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

      // Average cost should be preserved at $150 when selling (not changed to $200)
      expect(dbService.updateHolding).toHaveBeenCalledWith(
        'agent-seller',
        'AAPL',
        -50,
        150 // average cost preserved, not the trade price
      );
    });
  });

  describe('Short selling scenarios', () => {
    it('creates negative position when short selling', async () => {
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

  describe('Cash balance updates', () => {
    it('decreases buyer cash and increases seller cash correctly', async () => {
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

      const expectedTradeValue = 100 * 150; // 15000

      // Verify buyer's cash decreased
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-buyer', -expectedTradeValue);

      // Verify seller's cash increased
      expect(dbService.updateAgentCash).toHaveBeenCalledWith('agent-seller', expectedTradeValue);
    });
  });

  describe('Trade and holdings consistency', () => {
    it('inserts trade record before updating holdings', async () => {
      const callOrder: string[] = [];

      (dbService.insertTrade as Mock).mockImplementation(() => {
        callOrder.push('insertTrade');
        return Promise.resolve('mock-trade-id');
      });
      (dbService.updateHolding as Mock).mockImplementation(() => {
        callOrder.push('updateHolding');
        return Promise.resolve(undefined);
      });
      (dbService.deleteHolding as Mock).mockImplementation(() => {
        callOrder.push('deleteHolding');
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
      // Position updates (holdings and cash) should follow
      expect(callOrder.slice(1)).toContain('updateHolding');
      expect(callOrder.slice(1)).toContain('updateAgentCash');
    });
  });
});
