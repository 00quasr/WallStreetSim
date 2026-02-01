import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { OrderProcessedEvent } from '@wallstreetsim/types';

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

describe('Order Processing Logs', () => {
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

  describe('orderProcessed event emission', () => {
    it('emits orderProcessed event when a limit order is placed on the book', async () => {
      const events: OrderProcessedEvent[] = [];
      engine.on('orderProcessed', (event: OrderProcessedEvent) => {
        events.push(event);
      });

      const limitOrder = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        price: '140.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([limitOrder]);

      await engine.runTick();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        orderId: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 140.00,
        status: 'open',
        filledQuantity: 0,
        tick: 1,
      });
    });

    it('emits orderProcessed event with filled status when order matches', async () => {
      const events: OrderProcessedEvent[] = [];
      engine.on('orderProcessed', (event: OrderProcessedEvent) => {
        events.push(event);
      });

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
      await engine.runTick();

      // Clear events from first tick
      events.length = 0;

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
      await engine.runTick();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        orderId: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        status: 'filled',
        filledQuantity: 100,
        avgFillPrice: 150.00,
        tick: 2,
      });
    });

    it('emits orderProcessed event with partial status when order partially fills', async () => {
      const events: OrderProcessedEvent[] = [];
      engine.on('orderProcessed', (event: OrderProcessedEvent) => {
        events.push(event);
      });

      // First tick: Add a small sell order
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

      events.length = 0;

      // Second tick: Add a larger buy order (partial fill)
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

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        orderId: 'buy-order-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        status: 'partial',
        filledQuantity: 50,
        avgFillPrice: 150.00,
        tick: 2,
      });
    });

    it('emits orderProcessed event for market orders', async () => {
      const events: OrderProcessedEvent[] = [];
      engine.on('orderProcessed', (event: OrderProcessedEvent) => {
        events.push(event);
      });

      // First tick: Add a sell order
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

      events.length = 0;

      // Second tick: Add a market buy order
      const marketBuyOrder = {
        id: 'market-buy-1',
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
      await engine.runTick();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        orderId: 'market-buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        status: 'filled',
        filledQuantity: 100,
        avgFillPrice: 150.00,
        tick: 2,
      });
      expect(events[0].price).toBeUndefined();
    });

    it('emits orderProcessed events for multiple orders in single tick', async () => {
      const events: OrderProcessedEvent[] = [];
      engine.on('orderProcessed', (event: OrderProcessedEvent) => {
        events.push(event);
      });

      const order1 = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 50,
        price: '140.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 0,
        tickFilled: null,
        createdAt: new Date(),
      };

      const order2 = {
        id: 'order-2',
        agentId: 'agent-2',
        symbol: 'AAPL',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 75,
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
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([order1, order2]);

      await engine.runTick();

      expect(events).toHaveLength(2);
      expect(events[0].orderId).toBe('order-1');
      expect(events[1].orderId).toBe('order-2');
    });

    it('includes correct tick number in orderProcessed event', async () => {
      const events: OrderProcessedEvent[] = [];
      engine.on('orderProcessed', (event: OrderProcessedEvent) => {
        events.push(event);
      });

      // Run 3 ticks without orders
      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValue([]);
      await engine.runTick();
      await engine.runTick();
      await engine.runTick();

      // Now add an order on tick 4
      const order = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'LIMIT',
        quantity: 100,
        price: '140.00',
        stopPrice: null,
        status: 'pending',
        filledQuantity: 0,
        avgFillPrice: null,
        tickSubmitted: 3,
        tickFilled: null,
        createdAt: new Date(),
      };

      (dbService.getSymbolsWithPendingOrders as Mock).mockResolvedValueOnce(['AAPL']);
      (dbService.getPendingOrders as Mock).mockResolvedValueOnce([order]);

      await engine.runTick();

      expect(events).toHaveLength(1);
      expect(events[0].tick).toBe(4);
    });
  });
});
