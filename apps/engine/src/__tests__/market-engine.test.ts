import { describe, it, expect, beforeEach } from 'vitest';
import { MarketEngine } from '../market-engine';
import type { Order } from '@wallstreetsim/types';

describe('MarketEngine', () => {
  let engine: MarketEngine;

  beforeEach(() => {
    engine = new MarketEngine();
    engine.initialize(['AAPL', 'GOOG', 'TSLA']);
    engine.setTick(1);
  });

  describe('initialize', () => {
    it('creates order books for all symbols', () => {
      const aaplBook = engine.getOrderBook('AAPL');
      const googBook = engine.getOrderBook('GOOG');
      const tslaBook = engine.getOrderBook('TSLA');

      expect(aaplBook).toBeDefined();
      expect(googBook).toBeDefined();
      expect(tslaBook).toBeDefined();
      expect(aaplBook?.symbol).toBe('AAPL');
    });

    it('returns undefined for non-existent symbol', () => {
      const book = engine.getOrderBook('INVALID');
      expect(book).toBeUndefined();
    });
  });

  describe('submitOrder - LIMIT orders', () => {
    it('adds a BUY limit order to order book when no matching asks', () => {
      const order: Order = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(order);

      expect(fills).toHaveLength(0);
      expect(remainingQuantity).toBe(100);

      const book = engine.getOrderBook('AAPL');
      expect(book?.bids).toHaveLength(1);
      expect(book?.bids[0].price).toBe(150.00);
      expect(book?.bids[0].quantity).toBe(100);
    });

    it('adds a SELL limit order to order book when no matching bids', () => {
      const order: Order = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 160.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(order);

      expect(fills).toHaveLength(0);
      expect(remainingQuantity).toBe(50);

      const book = engine.getOrderBook('AAPL');
      expect(book?.asks).toHaveLength(1);
      expect(book?.asks[0].price).toBe(160.00);
      expect(book?.asks[0].quantity).toBe(50);
    });

    it('matches a BUY order against existing SELL orders', () => {
      // First add a SELL order
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // Then submit a BUY order at or above the ask price
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(1);
      expect(fills[0].quantity).toBe(100);
      expect(fills[0].price).toBe(150.00);
      expect(fills[0].buyerId).toBe('agent-buyer');
      expect(fills[0].sellerId).toBe('agent-seller');
      expect(remainingQuantity).toBe(0);

      // The ask should be removed from the book
      const book = engine.getOrderBook('AAPL');
      expect(book?.asks).toHaveLength(0);
    });

    it('matches a SELL order against existing BUY orders', () => {
      // First add a BUY order
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(buyOrder);

      // Then submit a SELL order at or below the bid price
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(sellOrder);

      expect(fills).toHaveLength(1);
      expect(fills[0].quantity).toBe(100);
      expect(fills[0].price).toBe(155.00);
      expect(remainingQuantity).toBe(0);

      const book = engine.getOrderBook('AAPL');
      expect(book?.bids).toHaveLength(0);
    });

    it('partially fills an order when not enough liquidity', () => {
      // Add a small SELL order
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // Submit a larger BUY order
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(1);
      expect(fills[0].quantity).toBe(50);
      expect(remainingQuantity).toBe(50);

      // Remaining should be added to bids
      const book = engine.getOrderBook('AAPL');
      expect(book?.asks).toHaveLength(0);
      expect(book?.bids).toHaveLength(1);
      expect(book?.bids[0].quantity).toBe(50);
    });

    it('does not match when prices do not cross', () => {
      // Add SELL at 155
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // BUY at 150 (below ask)
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(0);
      expect(remainingQuantity).toBe(100);

      const book = engine.getOrderBook('AAPL');
      expect(book?.asks).toHaveLength(1);
      expect(book?.bids).toHaveLength(1);
    });

    it('maintains price-time priority for bids (highest price first)', () => {
      const order1: Order = {
        id: 'buy-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const order2: Order = {
        id: 'buy-2',
        agentId: 'agent-2',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      engine.submitOrder(order1);
      engine.submitOrder(order2);

      const book = engine.getOrderBook('AAPL');
      expect(book?.bids[0].price).toBe(155.00);
      expect(book?.bids[1].price).toBe(150.00);
    });

    it('maintains price-time priority for asks (lowest price first)', () => {
      const order1: Order = {
        id: 'sell-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 160.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const order2: Order = {
        id: 'sell-2',
        agentId: 'agent-2',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      engine.submitOrder(order1);
      engine.submitOrder(order2);

      const book = engine.getOrderBook('AAPL');
      expect(book?.asks[0].price).toBe(155.00);
      expect(book?.asks[1].price).toBe(160.00);
    });
  });

  describe('submitOrder - MARKET orders', () => {
    it('executes a market BUY order against existing asks', () => {
      // Add asks to the book
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(sellOrder);

      // Submit market BUY
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(1);
      expect(fills[0].quantity).toBe(100);
      expect(fills[0].price).toBe(150.00);
      expect(remainingQuantity).toBe(0);
    });

    it('executes a market SELL order against existing bids', () => {
      // Add bids to the book
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(buyOrder);

      // Submit market SELL
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'MARKET',
        quantity: 100,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(sellOrder);

      expect(fills).toHaveLength(1);
      expect(fills[0].quantity).toBe(100);
      expect(fills[0].price).toBe(150.00);
      expect(remainingQuantity).toBe(0);
    });

    it('returns unfilled quantity when no liquidity for market order', () => {
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-buyer',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const { fills, remainingQuantity } = engine.submitOrder(buyOrder);

      expect(fills).toHaveLength(0);
      expect(remainingQuantity).toBe(100);
    });
  });

  describe('cancelOrder', () => {
    it('cancels an existing order', () => {
      const order: Order = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(order);

      const result = engine.cancelOrder('AAPL', 'order-1');

      expect(result).toBe(true);
      const book = engine.getOrderBook('AAPL');
      expect(book?.bids).toHaveLength(0);
    });

    it('returns false for non-existent order', () => {
      const result = engine.cancelOrder('AAPL', 'non-existent');
      expect(result).toBe(false);
    });

    it('returns false for non-existent symbol', () => {
      const result = engine.cancelOrder('INVALID', 'order-1');
      expect(result).toBe(false);
    });
  });

  describe('getBestBidAsk', () => {
    it('returns null when order book is empty', () => {
      const { bid, ask } = engine.getBestBidAsk('AAPL');
      expect(bid).toBeNull();
      expect(ask).toBeNull();
    });

    it('returns best bid and ask prices', () => {
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 155.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      engine.submitOrder(buyOrder);
      engine.submitOrder(sellOrder);

      const { bid, ask } = engine.getBestBidAsk('AAPL');
      expect(bid).toBe(150.00);
      expect(ask).toBe(155.00);
    });
  });

  describe('getMidPrice', () => {
    it('returns fallback price when no orders', () => {
      const midPrice = engine.getMidPrice('AAPL', 100.00);
      expect(midPrice).toBe(100.00);
    });

    it('returns mid price when both bid and ask exist', () => {
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 100,
        price: 160.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      engine.submitOrder(buyOrder);
      engine.submitOrder(sellOrder);

      const midPrice = engine.getMidPrice('AAPL', 100.00);
      expect(midPrice).toBe(155.00);
    });
  });

  describe('getDepth', () => {
    it('returns zero depth for empty order book', () => {
      const { bidDepth, askDepth } = engine.getDepth('AAPL');
      expect(bidDepth).toBe(0);
      expect(askDepth).toBe(0);
    });

    it('calculates total depth correctly', () => {
      const buyOrder: Order = {
        id: 'buy-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 160.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };

      engine.submitOrder(buyOrder);
      engine.submitOrder(sellOrder);

      const { bidDepth, askDepth } = engine.getDepth('AAPL');
      expect(bidDepth).toBe(100 * 150);
      expect(askDepth).toBe(50 * 160);
    });
  });

  describe('clearAll', () => {
    it('clears all order books', () => {
      const order: Order = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.00,
        status: 'pending',
        filledQuantity: 0,
        tickSubmitted: 1,
        createdAt: new Date(),
      };
      engine.submitOrder(order);

      engine.clearAll();

      const book = engine.getOrderBook('AAPL');
      expect(book?.bids).toHaveLength(0);
      expect(book?.asks).toHaveLength(0);
    });
  });

  describe('setTick', () => {
    it('updates the current tick', () => {
      engine.setTick(100);

      // Submit an order and verify trade has correct tick
      const sellOrder: Order = {
        id: 'sell-1',
        agentId: 'agent-seller',
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
        agentId: 'agent-buyer',
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

      expect(fills[0].tick).toBe(100);
    });
  });
});
