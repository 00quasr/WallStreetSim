import { describe, it, expect, beforeEach } from 'vitest';
import { PriceEngine } from '../price-engine';
import type { Company, Trade, Sector, SectorData, MarketEvent } from '@wallstreetsim/types';

function createMockCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'company-1',
    symbol: 'AAPL',
    name: 'Apple Inc',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    price: 150.00,
    previousClose: 149.00,
    open: 149.50,
    high: 151.00,
    low: 148.00,
    sharesOutstanding: 1000000,
    marketCap: 150000000,
    revenue: 50000000,
    profit: 10000000,
    cash: 20000000,
    debt: 5000000,
    peRatio: 15,
    volatility: 0.02,
    beta: 1.2,
    momentum: 0.01,
    sentiment: 0.5,
    manipulationScore: 0,
    isPublic: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    symbol: 'AAPL',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    buyerOrderId: 'order-buy-1',
    sellerOrderId: 'order-sell-1',
    price: 150.00,
    quantity: 100,
    tick: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

function createSectorData(): Map<Sector, SectorData> {
  const sectorData = new Map<Sector, SectorData>();
  const sectors: Sector[] = ['Technology', 'Finance', 'Healthcare', 'Energy', 'Consumer', 'Industrial', 'RealEstate', 'Utilities', 'Crypto', 'Meme'];

  for (const sector of sectors) {
    sectorData.set(sector, {
      sector,
      performance: 0,
      volatility: 0.02,
      correlation: 0.5,
    });
  }

  return sectorData;
}

describe('PriceEngine', () => {
  let engine: PriceEngine;
  let sectorData: Map<Sector, SectorData>;

  beforeEach(() => {
    engine = new PriceEngine({
      agentPressureWeight: 0.5,
      randomWalkWeight: 0,
      sectorCorrelationWeight: 0,
      maxTickMove: 0.1,
      minPrice: 0.01,
    });
    sectorData = createSectorData();
  });

  describe('initialize', () => {
    it('initializes with companies and sector data', () => {
      const companies = [
        createMockCompany({ symbol: 'AAPL', price: 150 }),
        createMockCompany({ symbol: 'GOOG', price: 2800 }),
      ];

      engine.initialize(companies, sectorData);

      expect(engine.getCompany('AAPL')).toBeDefined();
      expect(engine.getCompany('GOOG')).toBeDefined();
      expect(engine.getAllCompanies()).toHaveLength(2);
    });

    it('returns undefined for non-existent company', () => {
      engine.initialize([createMockCompany()], sectorData);
      expect(engine.getCompany('INVALID')).toBeUndefined();
    });
  });

  describe('processTick - trade feed integration', () => {
    it('updates prices based on trades', () => {
      const company = createMockCompany({ symbol: 'AAPL', price: 100.00, volatility: 0.02 });
      engine.initialize([company], sectorData);

      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 100.00, quantity: 1000 }),
      ];

      const updates = engine.processTick(1, trades);

      expect(updates).toHaveLength(1);
      expect(updates[0].symbol).toBe('AAPL');
      expect(updates[0].tick).toBe(1);
    });

    it('returns price updates with correct structure', () => {
      const company = createMockCompany({ symbol: 'AAPL', price: 100.00 });
      engine.initialize([company], sectorData);

      const updates = engine.processTick(1, []);

      expect(updates[0]).toHaveProperty('symbol');
      expect(updates[0]).toHaveProperty('oldPrice');
      expect(updates[0]).toHaveProperty('newPrice');
      expect(updates[0]).toHaveProperty('change');
      expect(updates[0]).toHaveProperty('changePercent');
      expect(updates[0]).toHaveProperty('volume');
      expect(updates[0]).toHaveProperty('drivers');
      expect(updates[0].drivers).toHaveProperty('agentPressure');
    });

    it('calculates buy pressure when trades are above current price', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.05,
        sharesOutstanding: 100000,
      });
      engine.initialize([company], sectorData);

      // Trades above current price indicate buy pressure
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 101.00, quantity: 1000 }),
        createMockTrade({ symbol: 'AAPL', price: 102.00, quantity: 500 }),
      ];

      const updates = engine.processTick(1, trades);

      // With only buy pressure, agentPressure should be positive
      expect(updates[0].drivers.agentPressure).toBeGreaterThan(0);
    });

    it('calculates sell pressure when trades are below current price', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.05,
        sharesOutstanding: 100000,
      });
      engine.initialize([company], sectorData);

      // Trades below current price indicate sell pressure
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 99.00, quantity: 1000 }),
        createMockTrade({ symbol: 'AAPL', price: 98.00, quantity: 500 }),
      ];

      const updates = engine.processTick(1, trades);

      // With only sell pressure, agentPressure should be negative
      expect(updates[0].drivers.agentPressure).toBeLessThan(0);
    });

    it('returns zero agent pressure with no trades', () => {
      const company = createMockCompany({ symbol: 'AAPL', price: 100.00 });
      engine.initialize([company], sectorData);

      const updates = engine.processTick(1, []);

      expect(updates[0].drivers.agentPressure).toBe(0);
    });

    it('calculates volume from trades', () => {
      const company = createMockCompany({ symbol: 'AAPL', price: 100.00 });
      engine.initialize([company], sectorData);

      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 100.00, quantity: 100 }),
        createMockTrade({ symbol: 'AAPL', price: 100.00, quantity: 200 }),
      ];

      const updates = engine.processTick(1, trades);

      expect(updates[0].volume).toBe(300);
    });

    it('filters trades by symbol', () => {
      const apple = createMockCompany({ symbol: 'AAPL', price: 100.00 });
      const google = createMockCompany({ symbol: 'GOOG', price: 2800.00 });
      engine.initialize([apple, google], sectorData);

      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 100.00, quantity: 100 }),
        createMockTrade({ symbol: 'GOOG', price: 2800.00, quantity: 50 }),
      ];

      const updates = engine.processTick(1, trades);

      const aaplUpdate = updates.find(u => u.symbol === 'AAPL');
      const googUpdate = updates.find(u => u.symbol === 'GOOG');

      expect(aaplUpdate?.volume).toBe(100);
      expect(googUpdate?.volume).toBe(50);
    });

    it('price increases with strong buy pressure', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.05,
        sharesOutstanding: 10000, // Small float = more price impact
      });
      engine.initialize([company], sectorData);

      // Large buy trades above current price
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 101.00, quantity: 5000 }),
        createMockTrade({ symbol: 'AAPL', price: 102.00, quantity: 5000 }),
      ];

      const updates = engine.processTick(1, trades);

      expect(updates[0].newPrice).toBeGreaterThan(updates[0].oldPrice);
    });

    it('price decreases with strong sell pressure', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.05,
        sharesOutstanding: 10000, // Small float = more price impact
      });
      engine.initialize([company], sectorData);

      // Large sell trades below current price
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 99.00, quantity: 5000 }),
        createMockTrade({ symbol: 'AAPL', price: 98.00, quantity: 5000 }),
      ];

      const updates = engine.processTick(1, trades);

      expect(updates[0].newPrice).toBeLessThan(updates[0].oldPrice);
    });

    it('balanced trades result in minimal price change', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.02,
        sharesOutstanding: 100000,
      });
      engine.initialize([company], sectorData);

      // Equal buy and sell volume
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 101.00, quantity: 500 }), // buy
        createMockTrade({ symbol: 'AAPL', price: 99.00, quantity: 500 }),  // sell
      ];

      const updates = engine.processTick(1, trades);

      // Agent pressure should be close to zero with balanced trades
      expect(Math.abs(updates[0].drivers.agentPressure)).toBeLessThan(1);
    });
  });

  describe('processTick - price constraints', () => {
    it('enforces minimum price', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 0.02, // Very low price
        volatility: 0.5, // High volatility
        sharesOutstanding: 100,
      });
      engine.initialize([company], sectorData);

      // Massive sell pressure
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 0.01, quantity: 10000 }),
      ];

      const updates = engine.processTick(1, trades);

      expect(updates[0].newPrice).toBeGreaterThanOrEqual(0.01);
    });

    it('clamps price movement to max tick move', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 1.0, // Extremely high volatility
        sharesOutstanding: 100,
      });
      engine.initialize([company], sectorData);

      // Massive trade pressure
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 200.00, quantity: 100000 }),
      ];

      const updates = engine.processTick(1, trades);

      // Max move is 10%, so max price is 110
      expect(updates[0].newPrice).toBeLessThanOrEqual(110);
    });
  });

  describe('processTick - company state updates', () => {
    it('updates company high when price exceeds previous high', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        high: 100.00,
        volatility: 0.05,
        sharesOutstanding: 1000,
      });
      engine.initialize([company], sectorData);

      // Buy pressure to push price up
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 105.00, quantity: 1000 }),
      ];

      engine.processTick(1, trades);

      const updatedCompany = engine.getCompany('AAPL');
      expect(updatedCompany?.high).toBeGreaterThan(100);
    });

    it('updates company low when price falls below previous low', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        low: 100.00,
        volatility: 0.05,
        sharesOutstanding: 1000,
      });
      engine.initialize([company], sectorData);

      // Sell pressure to push price down
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 95.00, quantity: 1000 }),
      ];

      engine.processTick(1, trades);

      const updatedCompany = engine.getCompany('AAPL');
      expect(updatedCompany?.low).toBeLessThan(100);
    });

    it('updates momentum based on price changes', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        momentum: 0,
        volatility: 0.05,
        sharesOutstanding: 1000,
      });
      engine.initialize([company], sectorData);

      // Buy pressure
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 105.00, quantity: 1000 }),
      ];

      engine.processTick(1, trades);

      const updatedCompany = engine.getCompany('AAPL');
      // Price went up, momentum should be positive
      expect(updatedCompany?.momentum).not.toBe(0);
    });

    it('tracks manipulation score for large agent pressure', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        manipulationScore: 0,
        volatility: 0.1,
        sharesOutstanding: 1000, // Small float = high impact
      });
      engine.initialize([company], sectorData);

      // Very large buy pressure
      const trades: Trade[] = [
        createMockTrade({ symbol: 'AAPL', price: 150.00, quantity: 5000 }),
      ];

      engine.processTick(1, trades);

      const updatedCompany = engine.getCompany('AAPL');
      expect(updatedCompany?.manipulationScore).toBeGreaterThan(0);
    });
  });

  describe('triggerEvent', () => {
    it('adds event and affects price calculation', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.1,
      });
      engine.initialize([company], sectorData);

      const event: MarketEvent = {
        id: 'event-1',
        type: 'EARNINGS',
        headline: 'Apple beats earnings',
        description: 'Strong quarter',
        impact: 0.05, // 5% positive impact
        symbol: 'AAPL',
        sector: undefined,
        tick: 1,
        duration: 10,
        createdAt: new Date(),
      };

      engine.triggerEvent(event);
      const updates = engine.processTick(1, []);

      expect(updates[0].drivers.eventImpact).not.toBe(0);
    });

    it('event impact decays over time', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.1,
      });
      engine.initialize([company], sectorData);

      const event: MarketEvent = {
        id: 'event-1',
        type: 'EARNINGS',
        headline: 'Apple beats earnings',
        description: 'Strong quarter',
        impact: 0.05,
        symbol: 'AAPL',
        sector: undefined,
        tick: 1,
        duration: 10,
        createdAt: new Date(),
      };

      engine.triggerEvent(event);

      const update1 = engine.processTick(1, []);
      const impact1 = update1[0].drivers.eventImpact;

      const update5 = engine.processTick(5, []);
      const impact5 = update5[0].drivers.eventImpact;

      // Impact should decay
      expect(Math.abs(impact5)).toBeLessThan(Math.abs(impact1));
    });

    it('events expire after duration', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        price: 100.00,
        volatility: 0.1,
      });
      engine.initialize([company], sectorData);

      const event: MarketEvent = {
        id: 'event-1',
        type: 'EARNINGS',
        headline: 'Apple beats earnings',
        description: 'Strong quarter',
        impact: 0.05,
        symbol: 'AAPL',
        sector: undefined,
        tick: 1,
        duration: 5,
        createdAt: new Date(),
      };

      engine.triggerEvent(event);

      // Advance past event duration
      for (let i = 1; i <= 10; i++) {
        engine.processTick(i, []);
      }

      const updateAfterExpiry = engine.processTick(11, []);
      expect(updateAfterExpiry[0].drivers.eventImpact).toBe(0);
    });
  });

  describe('updateCompany', () => {
    it('updates company state', () => {
      const company = createMockCompany({ symbol: 'AAPL', price: 100.00 });
      engine.initialize([company], sectorData);

      engine.updateCompany('AAPL', { volatility: 0.1, beta: 1.5 });

      const updatedCompany = engine.getCompany('AAPL');
      expect(updatedCompany?.volatility).toBe(0.1);
      expect(updatedCompany?.beta).toBe(1.5);
    });

    it('does nothing for non-existent company', () => {
      engine.initialize([createMockCompany()], sectorData);

      // Should not throw
      engine.updateCompany('INVALID', { price: 999 });

      expect(engine.getCompany('INVALID')).toBeUndefined();
    });
  });

  describe('updateSectorData', () => {
    it('updates sector data for correlation calculations', () => {
      const company = createMockCompany({
        symbol: 'AAPL',
        sector: 'Technology',
        price: 100.00,
        beta: 1.5,
      });

      // Configure with sector correlation weight
      engine = new PriceEngine({
        agentPressureWeight: 0,
        randomWalkWeight: 0,
        sectorCorrelationWeight: 1.0, // Full sector correlation
        maxTickMove: 0.1,
        minPrice: 0.01,
      });

      engine.initialize([company], sectorData);

      // Update sector with positive performance
      const newSectorData = createSectorData();
      newSectorData.set('Technology', {
        sector: 'Technology',
        performance: 5.0, // 5% sector performance
        volatility: 0.02,
        correlation: 0.5,
      });

      engine.updateSectorData(newSectorData);

      const updates = engine.processTick(1, []);

      // With positive sector performance and sectorCorrelationWeight=1, price should increase
      expect(updates[0].drivers.sectorCorrelation).toBeGreaterThan(0);
    });
  });
});
