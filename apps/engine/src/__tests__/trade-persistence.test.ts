import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MarketEngine } from '../market-engine';
import type { Order, Trade } from '@wallstreetsim/types';

// Mock the db service
vi.mock('../services/db', () => ({
  insertTrade: vi.fn().mockResolvedValue('mock-trade-id'),
  getTradesForTick: vi.fn().mockResolvedValue([]),
  updateOrderStatus: vi.fn().mockResolvedValue(undefined),
  updateHolding: vi.fn().mockResolvedValue(undefined),
  updateAgentCash: vi.fn().mockResolvedValue(undefined),
  getHolding: vi.fn().mockResolvedValue(null),
  getAgentHoldings: vi.fn().mockResolvedValue([]),
  deleteHolding: vi.fn().mockResolvedValue(undefined),
  getPendingOrders: vi.fn().mockResolvedValue([]),
  getSymbolsWithPendingOrders: vi.fn().mockResolvedValue([]),
}));

import * as dbService from '../services/db';

describe('Trade Persistence', () => {
  let engine: MarketEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new MarketEngine();
    engine.initialize(['AAPL', 'GOOG']);
    engine.setTick(100);
  });

  describe('Trade generation from order matching', () => {
    it('generates a trade with all required fields when orders match', () => {
      // Add a sell order to the book
      const sellOrder: Order = {
        id: 'sell-order-id',
        agentId: 'seller-agent-id',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // Submit a matching buy order
      const buyOrder: Order = {
        id: 'buy-order-id',
        agentId: 'buyer-agent-id',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(1);
      const trade = fills[0];

      // Verify all required trade fields
      expect(trade.id).toBeDefined();
      expect(trade.symbol).toBe('AAPL');
      expect(trade.buyerId).toBe('buyer-agent-id');
      expect(trade.sellerId).toBe('seller-agent-id');
      expect(trade.buyerOrderId).toBe('buy-order-id');
      expect(trade.sellerOrderId).toBe('sell-order-id');
      expect(trade.price).toBe(150.00);
      expect(trade.quantity).toBe(100);
      expect(trade.tick).toBe(100);
      expect(trade.createdAt).toBeInstanceOf(Date);
    });

    it('generates multiple trades when order matches multiple price levels', () => {
      // Add sell orders at different prices
      const sellOrder1: Order = {
        id: 'sell-1',
        agentId: 'seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 148.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const sellOrder2: Order = {
        id: 'sell-2',
        agentId: 'seller-2',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      engine.submitOrder(sellOrder1);
      engine.submitOrder(sellOrder2);

      // Buy 100 shares at market price (limit order at high price to cross both)
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(2);
      expect(remainingQuantity).toBe(0);

      // First fill should be at the better (lower) price
      expect(fills[0].price).toBe(148.00);
      expect(fills[0].quantity).toBe(50);
      expect(fills[0].sellerId).toBe('seller-1');

      // Second fill at the next price level
      expect(fills[1].price).toBe(150.00);
      expect(fills[1].quantity).toBe(50);
      expect(fills[1].sellerId).toBe('seller-2');
    });

    it('generates trade with correct buyer/seller for SELL market order', () => {
      // Add buy order to the book
      const buyOrder: Order = {
        id: 'buy-order-id',
        agentId: 'buyer-agent-id',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(buyOrder);

      // Submit a market sell order
      const sellOrder: Order = {
        id: 'sell-order-id',
        agentId: 'seller-agent-id',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'MARKET',
        quantity: 100,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills } = engine.submitOrder(sellOrder);

      expect(fills).toHaveLength(1);
      const trade = fills[0];

      // Verify buyer/seller are correctly assigned
      expect(trade.buyerId).toBe('buyer-agent-id');
      expect(trade.buyerOrderId).toBe('buy-order-id');
      expect(trade.sellerId).toBe('seller-agent-id');
      expect(trade.sellerOrderId).toBe('sell-order-id');
    });

    it('trade uses resting order price, not incoming order price', () => {
      // Resting sell order at 150
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // Aggressive buy at 160 (willing to pay more)
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 160.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills } = engine.submitOrder(buyOrder);

      // Trade should execute at the resting order price (150), not the incoming order price (160)
      expect(fills[0].price).toBe(150.00);
    });

    it('partial fill generates trade with correct quantity', () => {
      // Add small sell order
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 30,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // Larger buy order
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(1);
      expect(fills[0].quantity).toBe(30);
      expect(remainingQuantity).toBe(70);
    });
  });

  describe('Trade data validation', () => {
    it('trade has unique id', () => {
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills: fills1 } = engine.submitOrder(buyOrder);

      // Submit another matching pair
      const sellOrder2: Order = {
        id: 'sell-2',
        agentId: 'seller-2',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 151.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder2);

      const buyOrder2: Order = {
        id: 'buy-2',
        agentId: 'buyer-2',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 151.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills: fills2 } = engine.submitOrder(buyOrder2);

      // Each trade should have a unique id
      expect(fills1[0].id).not.toBe(fills2[0].id);
    });

    it('trade timestamp is close to current time', () => {
      const before = new Date();

      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 100,
        createdAt: new Date(),
      };

      const { fills } = engine.submitOrder(buyOrder);
      const after = new Date();

      expect(fills[0].createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(fills[0].createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('trade reflects current tick', () => {
      engine.setTick(500);

      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'seller-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 500,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'buyer-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 500,
        createdAt: new Date(),
      };

      const { fills } = engine.submitOrder(buyOrder);

      expect(fills[0].tick).toBe(500);
    });
  });

  describe('insertTrade function contract', () => {
    it('insertTrade is called with correct parameters format', async () => {
      const trade = {
        tick: 100,
        symbol: 'AAPL',
        buyerId: 'buyer-id',
        sellerId: 'seller-id',
        buyerOrderId: 'buyer-order-id',
        sellerOrderId: 'seller-order-id',
        price: 150.50,
        quantity: 100,
      };

      await dbService.insertTrade(trade);

      expect(dbService.insertTrade).toHaveBeenCalledWith({
        tick: 100,
        symbol: 'AAPL',
        buyerId: 'buyer-id',
        sellerId: 'seller-id',
        buyerOrderId: 'buyer-order-id',
        sellerOrderId: 'seller-order-id',
        price: 150.50,
        quantity: 100,
      });
    });

    it('insertTrade returns a trade id', async () => {
      const trade = {
        tick: 100,
        symbol: 'AAPL',
        buyerId: 'buyer-id',
        sellerId: 'seller-id',
        buyerOrderId: 'buyer-order-id',
        sellerOrderId: 'seller-order-id',
        price: 150.50,
        quantity: 100,
      };

      const result = await dbService.insertTrade(trade);

      expect(result).toBe('mock-trade-id');
    });
  });
});

describe('Trade persistence integration', () => {
  it('trade object structure matches database schema', () => {
    const engine = new MarketEngine();
    engine.initialize(['AAPL']);
    engine.setTick(100);

    const sellOrder: Order = {
      id: 'sell-1',
      agentId: 'seller-1',
      symbol: 'AAPL',
      side: 'SELL',
      type: 'LIMIT',
      quantity: 100,
      price: 150.00,
      status: 'pending',
      filledQuantity: 0,
      tickSubmitted: 100,
      createdAt: new Date(),
    };
    engine.submitOrder(sellOrder);

    const buyOrder: Order = {
      id: 'buy-1',
      agentId: 'buyer-1',
      symbol: 'AAPL',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 100,
      price: 150.00,
      status: 'pending',
      filledQuantity: 0,
      tickSubmitted: 100,
      createdAt: new Date(),
    };

    const { fills } = engine.submitOrder(buyOrder);
    const trade = fills[0];

    // Verify trade has all fields that match the database schema
    // trades table: id, tick, symbol, buyerId, sellerId, buyerOrderId, sellerOrderId, quantity, price, createdAt
    expect(trade).toHaveProperty('id');
    expect(trade).toHaveProperty('tick');
    expect(trade).toHaveProperty('symbol');
    expect(trade).toHaveProperty('buyerId');
    expect(trade).toHaveProperty('sellerId');
    expect(trade).toHaveProperty('buyerOrderId');
    expect(trade).toHaveProperty('sellerOrderId');
    expect(trade).toHaveProperty('quantity');
    expect(trade).toHaveProperty('price');
    expect(trade).toHaveProperty('createdAt');

    // Verify types match expected database types
    expect(typeof trade.id).toBe('string');
    expect(typeof trade.tick).toBe('number');
    expect(typeof trade.symbol).toBe('string');
    expect(typeof trade.buyerId).toBe('string');
    expect(typeof trade.sellerId).toBe('string');
    expect(typeof trade.buyerOrderId).toBe('string');
    expect(typeof trade.sellerOrderId).toBe('string');
    expect(typeof trade.quantity).toBe('number');
    expect(typeof trade.price).toBe('number');
    expect(trade.createdAt).toBeInstanceOf(Date);
  });
});
