import { describe, it, expect, beforeEach } from 'vitest';
import { MarketMaker } from '../market-maker';
import { MarketEngine } from '../market-engine';
import type { Company } from '@wallstreetsim/types';

const createTestCompany = (overrides: Partial<Company> = {}): Company => ({
  id: 'company-1',
  symbol: 'TEST',
  name: 'Test Company',
  sector: 'Technology',
  industry: 'Software',
  price: 100,
  previousClose: 99,
  open: 99.5,
  high: 101,
  low: 98,
  sharesOutstanding: 1_000_000,
  marketCap: 100_000_000,
  revenue: 10_000_000,
  profit: 1_000_000,
  cash: 5_000_000,
  debt: 2_000_000,
  peRatio: 20,
  volatility: 0.02,
  beta: 1,
  momentum: 0,
  sentiment: 0,
  manipulationScore: 0,
  isPublic: true,
  createdAt: new Date(),
  ...overrides,
});

describe('MarketMaker', () => {
  let marketMaker: MarketMaker;

  beforeEach(() => {
    marketMaker = new MarketMaker();
  });

  describe('generateInitialLiquidity', () => {
    it('generates orders for a valid company', () => {
      const company = createTestCompany();
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      expect(orders.length).toBeGreaterThan(0);
    });

    it('generates both bid and ask orders', () => {
      const company = createTestCompany();
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      const bids = orders.filter(o => o.side === 'BUY');
      const asks = orders.filter(o => o.side === 'SELL');

      expect(bids.length).toBeGreaterThan(0);
      expect(asks.length).toBeGreaterThan(0);
    });

    it('generates 5 levels on each side by default', () => {
      const company = createTestCompany();
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      const bids = orders.filter(o => o.side === 'BUY');
      const asks = orders.filter(o => o.side === 'SELL');

      expect(bids.length).toBe(5);
      expect(asks.length).toBe(5);
    });

    it('generates bids below the mid price', () => {
      const company = createTestCompany({ price: 100 });
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      const bids = orders.filter(o => o.side === 'BUY');
      for (const bid of bids) {
        expect(bid.price).toBeLessThan(company.price);
      }
    });

    it('generates asks above the mid price', () => {
      const company = createTestCompany({ price: 100 });
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      const asks = orders.filter(o => o.side === 'SELL');
      for (const ask of asks) {
        expect(ask.price).toBeGreaterThan(company.price);
      }
    });

    it('sets all orders as LIMIT type', () => {
      const company = createTestCompany();
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      for (const order of orders) {
        expect(order.type).toBe('LIMIT');
      }
    });

    it('sets correct agent ID on orders', () => {
      const company = createTestCompany();
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      for (const order of orders) {
        expect(order.agentId).toBe('MARKET_MAKER');
      }
    });

    it('sets correct tick submitted', () => {
      const company = createTestCompany();
      const tick = 42;
      const orders = marketMaker.generateInitialLiquidity(company, tick);

      for (const order of orders) {
        expect(order.tickSubmitted).toBe(tick);
      }
    });

    it('generates no orders for company with zero price', () => {
      const company = createTestCompany({ price: 0 });
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      expect(orders.length).toBe(0);
    });

    it('generates no orders for company with negative price', () => {
      const company = createTestCompany({ price: -10 });
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      expect(orders.length).toBe(0);
    });

    it('adjusts spread for high volatility stocks', () => {
      const lowVolCompany = createTestCompany({ price: 100, volatility: 0.01 });
      const highVolCompany = createTestCompany({ price: 100, volatility: 0.05 });

      const lowVolOrders = marketMaker.generateInitialLiquidity(lowVolCompany, 1);
      const highVolOrders = marketMaker.generateInitialLiquidity(highVolCompany, 1);

      const lowVolBestBid = lowVolOrders.filter(o => o.side === 'BUY')
        .reduce((max, o) => Math.max(max, o.price!), 0);
      const highVolBestBid = highVolOrders.filter(o => o.side === 'BUY')
        .reduce((max, o) => Math.max(max, o.price!), 0);

      // High volatility stock should have wider spread (lower best bid)
      expect(highVolBestBid).toBeLessThan(lowVolBestBid);
    });

    it('generates unique order IDs', () => {
      const company = createTestCompany();
      const orders = marketMaker.generateInitialLiquidity(company, 1);

      const ids = orders.map(o => o.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('generateLiquidityForAll', () => {
    it('generates orders for multiple companies', () => {
      const companies = [
        createTestCompany({ symbol: 'AAPL', price: 150 }),
        createTestCompany({ symbol: 'GOOG', price: 2800 }),
        createTestCompany({ symbol: 'TSLA', price: 200 }),
      ];

      const orders = marketMaker.generateLiquidityForAll(companies, 1);

      const aaplOrders = orders.filter(o => o.symbol === 'AAPL');
      const googOrders = orders.filter(o => o.symbol === 'GOOG');
      const tslaOrders = orders.filter(o => o.symbol === 'TSLA');

      expect(aaplOrders.length).toBeGreaterThan(0);
      expect(googOrders.length).toBeGreaterThan(0);
      expect(tslaOrders.length).toBeGreaterThan(0);
    });

    it('returns empty array for empty company list', () => {
      const orders = marketMaker.generateLiquidityForAll([], 1);
      expect(orders).toHaveLength(0);
    });
  });

  describe('custom configuration', () => {
    it('uses custom agent ID', () => {
      const customMM = new MarketMaker({ agentId: 'CUSTOM_MM' });
      const company = createTestCompany();
      const orders = customMM.generateInitialLiquidity(company, 1);

      for (const order of orders) {
        expect(order.agentId).toBe('CUSTOM_MM');
      }
    });

    it('uses custom number of levels', () => {
      const customMM = new MarketMaker({ levels: 3 });
      const company = createTestCompany();
      const orders = customMM.generateInitialLiquidity(company, 1);

      const bids = orders.filter(o => o.side === 'BUY');
      const asks = orders.filter(o => o.side === 'SELL');

      expect(bids.length).toBe(3);
      expect(asks.length).toBe(3);
    });

    it('uses custom base quantity', () => {
      const customMM = new MarketMaker({ baseQuantity: 500, levels: 1 });
      const company = createTestCompany();
      const orders = customMM.generateInitialLiquidity(company, 1);

      for (const order of orders) {
        expect(order.quantity).toBe(500);
      }
    });

    it('getAgentId returns configured agent ID', () => {
      const customMM = new MarketMaker({ agentId: 'MY_AGENT' });
      expect(customMM.getAgentId()).toBe('MY_AGENT');
    });
  });
});

describe('MarketEngine.seedLiquidity', () => {
  let engine: MarketEngine;
  let marketMaker: MarketMaker;

  beforeEach(() => {
    engine = new MarketEngine();
    engine.initialize(['AAPL', 'GOOG']);
    engine.setTick(1);
    marketMaker = new MarketMaker();
  });

  it('adds liquidity orders to the order book without matching', () => {
    const company = createTestCompany({ symbol: 'AAPL', price: 150 });
    const orders = marketMaker.generateInitialLiquidity(company, 1);

    engine.seedLiquidity(orders);

    const { bid, ask } = engine.getBestBidAsk('AAPL');
    expect(bid).not.toBeNull();
    expect(ask).not.toBeNull();
  });

  it('creates proper bid/ask spread', () => {
    const company = createTestCompany({ symbol: 'AAPL', price: 100 });
    const orders = marketMaker.generateInitialLiquidity(company, 1);

    engine.seedLiquidity(orders);

    const { bid, ask } = engine.getBestBidAsk('AAPL');
    expect(bid).toBeLessThan(100);
    expect(ask).toBeGreaterThan(100);
  });

  it('does not create trades when seeding liquidity', () => {
    const company = createTestCompany({ symbol: 'AAPL', price: 100 });
    const orders = marketMaker.generateInitialLiquidity(company, 1);

    // Seed both sides - should not match against each other
    engine.seedLiquidity(orders);

    const book = engine.getOrderBook('AAPL');
    expect(book?.bids.length).toBeGreaterThan(0);
    expect(book?.asks.length).toBeGreaterThan(0);
  });

  it('ignores non-limit orders', () => {
    const marketOrder = {
      id: 'order-1',
      agentId: 'test',
      symbol: 'AAPL',
      side: 'BUY' as const,
      type: 'MARKET' as const,
      quantity: 100,
      status: 'pending' as const,
      filledQuantity: 0,
      tickSubmitted: 1,
      createdAt: new Date(),
    };

    engine.seedLiquidity([marketOrder]);

    const { bid, ask } = engine.getBestBidAsk('AAPL');
    expect(bid).toBeNull();
    expect(ask).toBeNull();
  });

  it('ignores orders without price', () => {
    const limitOrderNoPrice = {
      id: 'order-1',
      agentId: 'test',
      symbol: 'AAPL',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 100,
      price: undefined,
      status: 'pending' as const,
      filledQuantity: 0,
      tickSubmitted: 1,
      createdAt: new Date(),
    };

    engine.seedLiquidity([limitOrderNoPrice]);

    const { bid, ask } = engine.getBestBidAsk('AAPL');
    expect(bid).toBeNull();
    expect(ask).toBeNull();
  });

  it('ignores orders for unknown symbols', () => {
    const order = {
      id: 'order-1',
      agentId: 'test',
      symbol: 'UNKNOWN',
      side: 'BUY' as const,
      type: 'LIMIT' as const,
      quantity: 100,
      price: 50,
      status: 'pending' as const,
      filledQuantity: 0,
      tickSubmitted: 1,
      createdAt: new Date(),
    };

    // Should not throw
    expect(() => engine.seedLiquidity([order])).not.toThrow();
  });

  it('calculates depth correctly after seeding', () => {
    const company = createTestCompany({ symbol: 'AAPL', price: 100 });
    const orders = marketMaker.generateInitialLiquidity(company, 1);

    engine.seedLiquidity(orders);

    const { bidDepth, askDepth } = engine.getDepth('AAPL');
    expect(bidDepth).toBeGreaterThan(0);
    expect(askDepth).toBeGreaterThan(0);
  });

  it('allows subsequent market orders to execute against liquidity', () => {
    const company = createTestCompany({ symbol: 'AAPL', price: 100 });
    const liquidityOrders = marketMaker.generateInitialLiquidity(company, 1);

    engine.seedLiquidity(liquidityOrders);

    // Now submit a market buy order
    const marketBuy = {
      id: 'buy-order',
      agentId: 'trader',
      symbol: 'AAPL',
      side: 'BUY' as const,
      type: 'MARKET' as const,
      quantity: 100,
      status: 'pending' as const,
      filledQuantity: 0,
      tickSubmitted: 2,
      createdAt: new Date(),
    };

    const { fills, remainingQuantity } = engine.submitOrder(marketBuy);

    expect(fills.length).toBeGreaterThan(0);
    expect(remainingQuantity).toBe(0);
    expect(fills[0].sellerId).toBe('MARKET_MAKER');
  });
});
