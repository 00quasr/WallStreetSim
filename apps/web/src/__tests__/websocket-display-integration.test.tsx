/**
 * Integration tests for WebSocket data display
 *
 * These tests verify the complete flow from WebSocket events through hooks,
 * ensuring the frontend correctly receives and processes real-time data.
 *
 * Component rendering tests are in individual component test files.
 * This file focuses on hook behavior and data transformation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveFeed } from '@/hooks/useLiveFeed';
import { useMarketData } from '@/hooks/useMarketData';
import type {
  WSTrade,
  WSNews,
  WSPriceUpdate,
  WSAlert,
  WSOrderFilled,
  WSInvestigation,
  WSMarginCall,
} from '@wallstreetsim/types';

// Store event handlers for socket event simulation
const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

// Mock socket instance
const mockSocket = {
  connected: false,
  id: 'test-socket-id',
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!eventHandlers[event]) {
      eventHandlers[event] = [];
    }
    eventHandlers[event].push(handler);
  }),
  once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!eventHandlers[event]) {
      eventHandlers[event] = [];
    }
    eventHandlers[event].push(handler);
  }),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
};

// Helper to trigger socket events
function triggerSocketEvent(event: string, ...args: unknown[]) {
  const handlers = eventHandlers[event] || [];
  handlers.forEach((handler) => handler(...args));
}

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Sequence counter for message ordering (as required by WSMessage interface)
let sequenceCounter = 0;

// Test data factories - note: we cast to the return type to match existing test patterns
// in the codebase where sequence is optional at runtime
function createTradeEvent(overrides: Partial<WSTrade['payload']> = {}) {
  return {
    type: 'TRADE' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: {
      id: `trade-${Date.now()}`,
      symbol: 'APEX',
      buyerId: 'agent-buyer',
      sellerId: 'agent-seller',
      buyerOrderId: 'order-buy-1',
      sellerOrderId: 'order-sell-1',
      price: 150.00,
      quantity: 100,
      tick: 42,
      createdAt: new Date(),
      ...overrides,
    },
  } as WSTrade;
}

function createNewsEvent(overrides: Partial<WSNews['payload']> = {}) {
  return {
    type: 'NEWS' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: {
      id: `news-${Date.now()}`,
      tick: 42,
      headline: 'Market Update: APEX Reports Strong Earnings',
      content: 'Full article content here...',
      category: 'market',
      sentiment: 0.5,
      agentIds: [],
      symbols: ['APEX'],
      createdAt: new Date(),
      isBreaking: false,
      ...overrides,
    },
  } as WSNews;
}

function createPriceUpdateEvent(
  tick: number,
  prices: WSPriceUpdate['payload']['prices']
) {
  return {
    type: 'PRICE_UPDATE' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: { tick, prices },
  } as WSPriceUpdate;
}

function createAlertEvent(overrides: Partial<WSAlert['payload']> = {}) {
  return {
    type: 'ALERT' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: {
      id: `alert-${Date.now()}`,
      agentId: 'agent-1',
      type: 'margin_call',
      message: 'Warning: Approaching margin limit',
      severity: 'warning',
      tick: 42,
      createdAt: new Date(),
      acknowledged: false,
      ...overrides,
    },
  } as WSAlert;
}

function createOrderFilledEvent(overrides: Partial<WSOrderFilled['payload']> = {}) {
  return {
    type: 'ORDER_FILLED' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: {
      orderId: `order-${Date.now()}`,
      symbol: 'APEX',
      side: 'BUY',
      quantity: 100,
      price: 150.00,
      tick: 42,
      ...overrides,
    },
  } as WSOrderFilled;
}

function createInvestigationEvent(overrides: Partial<WSInvestigation['payload']> = {}) {
  return {
    type: 'INVESTIGATION' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: {
      investigationId: `inv-${Date.now()}`,
      status: 'opened',
      crimeType: 'insider_trading',
      message: 'SEC Investigation Opened',
      tick: 42,
      ...overrides,
    },
  } as WSInvestigation;
}

function createMarginCallEvent(overrides: Partial<WSMarginCall['payload']> = {}) {
  return {
    type: 'MARGIN_CALL' as const,
    timestamp: new Date().toISOString(),
    sequence: ++sequenceCounter,
    payload: {
      marginUsed: 80000,
      marginLimit: 100000,
      portfolioValue: 150000,
      message: 'Margin call triggered',
      tick: 42,
      ...overrides,
    },
  } as WSMarginCall;
}


describe('WebSocket Display Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key]);
    mockSocket.connected = false;
    mockSocket.id = 'test-socket-id';
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('useLiveFeed hook integration', () => {
    describe('receives and processes all WebSocket event types', () => {
      it('should receive TRADE events and format them with price and quantity', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const tradeEvent = createTradeEvent({
          symbol: 'APEX',
          price: 156.78,
          quantity: 10000,
        });

        act(() => {
          triggerSocketEvent('TRADE', tradeEvent);
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].type).toBe('trade');
        expect(result.current.items[0].content).toContain('APEX');
        expect(result.current.items[0].content).toContain('10,000');
        expect(result.current.items[0].content).toContain('$156.78');
      });

      it('should receive NEWS events with breaking news prefix', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const newsEvent = createNewsEvent({
          headline: 'OMEGA Corporation Announces Merger',
          isBreaking: true,
        });

        act(() => {
          triggerSocketEvent('NEWS', newsEvent);
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].type).toBe('news');
        expect(result.current.items[0].content).toBe('BREAKING: OMEGA Corporation Announces Merger');
      });

      it('should receive NEWS events without prefix for non-breaking news', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const newsEvent = createNewsEvent({
          headline: 'Regular market update',
          isBreaking: false,
        });

        act(() => {
          triggerSocketEvent('NEWS', newsEvent);
        });

        expect(result.current.items[0].content).toBe('Regular market update');
      });

      it('should receive PRICE_UPDATE events and create individual items per symbol', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const priceEvent = createPriceUpdateEvent(50, [
          { symbol: 'APEX', price: 160.00, change: 5.00, changePercent: 3.23, volume: 100000 },
          { symbol: 'BLCK', price: 85.50, change: -2.00, changePercent: -2.28, volume: 50000 },
        ]);

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', priceEvent);
        });

        expect(result.current.items).toHaveLength(2);
        expect(result.current.items.every(item => item.type === 'price')).toBe(true);

        const apexItem = result.current.items.find(i => i.content.includes('APEX'));
        expect(apexItem?.content).toContain('$160.00');
        expect(apexItem?.content).toContain('+5.00');
        expect(apexItem?.content).toContain('+3.23%');

        const blckItem = result.current.items.find(i => i.content.includes('BLCK'));
        expect(blckItem?.content).toContain('$85.50');
        expect(blckItem?.content).toContain('-2.00');
        expect(blckItem?.content).toContain('-2.28%');
      });

      it('should receive ALERT events and display them correctly', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const alertEvent = createAlertEvent({
          message: 'Critical: Position liquidation imminent',
        });

        act(() => {
          triggerSocketEvent('ALERT', alertEvent);
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].type).toBe('alert');
        expect(result.current.items[0].content).toBe('Critical: Position liquidation imminent');
      });

      it('should receive ORDER_FILLED events with correct formatting', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const orderEvent = createOrderFilledEvent({
          symbol: 'NXUS',
          side: 'SELL',
          quantity: 500,
          price: 89.99,
        });

        act(() => {
          triggerSocketEvent('ORDER_FILLED', orderEvent);
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].type).toBe('order');
        expect(result.current.items[0].content).toContain('SELL');
        expect(result.current.items[0].content).toContain('NXUS');
        expect(result.current.items[0].content).toContain('500');
        expect(result.current.items[0].content).toContain('$89.99');
      });

      it('should receive INVESTIGATION events and display them as events', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const invEvent = createInvestigationEvent({
          message: 'SEC opens investigation into ShadowTrader for market manipulation',
        });

        act(() => {
          triggerSocketEvent('INVESTIGATION', invEvent);
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].type).toBe('event');
        expect(result.current.items[0].content).toBe('SEC opens investigation into ShadowTrader for market manipulation');
      });

      it('should receive MARGIN_CALL events and display them as alerts', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const marginEvent = createMarginCallEvent({
          message: 'Margin call: deposit $50,000 within 24 ticks',
        });

        act(() => {
          triggerSocketEvent('MARGIN_CALL', marginEvent);
        });

        expect(result.current.items).toHaveLength(1);
        expect(result.current.items[0].type).toBe('alert');
        expect(result.current.items[0].content).toBe('Margin call: deposit $50,000 within 24 ticks');
      });
    });

    describe('handles multiple events in sequence', () => {
      it('should maintain correct order with newest items first', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent({ id: 'trade-1', tick: 1 }));
        });

        act(() => {
          triggerSocketEvent('NEWS', createNewsEvent({ id: 'news-1', tick: 2 }));
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent({ id: 'trade-2', tick: 3 }));
        });

        expect(result.current.items).toHaveLength(3);
        expect(result.current.items[0].id).toBe('trade-trade-2'); // Most recent first
        expect(result.current.items[1].id).toBe('news-news-1');
        expect(result.current.items[2].id).toBe('trade-trade-1');
      });

      it('should handle rapid event bursts without losing data', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        // Simulate burst of 50 rapid events
        act(() => {
          for (let i = 0; i < 50; i++) {
            triggerSocketEvent('TRADE', createTradeEvent({ id: `burst-trade-${i}`, tick: i }));
          }
        });

        expect(result.current.items.length).toBe(50);
        expect(result.current.lastTick).toBe(49);
      });
    });

    describe('respects maxItems limit', () => {
      it('should trim older items when exceeding maxItems', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false, maxItems: 5 }));

        act(() => {
          result.current.connect();
        });

        // Add 10 events
        act(() => {
          for (let i = 0; i < 10; i++) {
            triggerSocketEvent('TRADE', createTradeEvent({ id: `trade-${i}`, tick: i }));
          }
        });

        expect(result.current.items).toHaveLength(5);
        // Should keep the 5 most recent (trades 5-9)
        expect(result.current.items[0].id).toBe('trade-trade-9');
        expect(result.current.items[4].id).toBe('trade-trade-5');
      });
    });

    describe('symbol filtering', () => {
      it('should only show events for specified symbols', () => {
        const { result } = renderHook(() =>
          useLiveFeed({ autoConnect: false, symbols: ['APEX'] })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent({ symbol: 'APEX' }));
          triggerSocketEvent('TRADE', createTradeEvent({ symbol: 'BLCK' }));
          triggerSocketEvent('TRADE', createTradeEvent({ symbol: 'NXUS' }));
          triggerSocketEvent('TRADE', createTradeEvent({ symbol: 'APEX' }));
        });

        expect(result.current.items).toHaveLength(2);
        expect(result.current.items.every(item => item.content.includes('APEX'))).toBe(true);
      });

      it('should filter news by related symbols', () => {
        const { result } = renderHook(() =>
          useLiveFeed({ autoConnect: false, symbols: ['APEX'] })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('NEWS', createNewsEvent({ symbols: ['APEX'], headline: 'APEX news' }));
          triggerSocketEvent('NEWS', createNewsEvent({ symbols: ['BLCK'], headline: 'BLCK news' }));
          triggerSocketEvent('NEWS', createNewsEvent({ symbols: ['APEX', 'OMEGA'], headline: 'Multi news' }));
        });

        expect(result.current.items).toHaveLength(2);
      });
    });

    describe('type filtering', () => {
      it('should only show specified event types', () => {
        const { result } = renderHook(() =>
          useLiveFeed({ autoConnect: false, types: ['trade', 'alert'] })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent());
          triggerSocketEvent('NEWS', createNewsEvent());
          triggerSocketEvent('ALERT', createAlertEvent());
          triggerSocketEvent('INVESTIGATION', createInvestigationEvent());
        });

        expect(result.current.items).toHaveLength(2);
        const types = result.current.items.map(item => item.type);
        expect(types).toContain('trade');
        expect(types).toContain('alert');
        expect(types).not.toContain('news');
        expect(types).not.toContain('event');
      });
    });

    describe('tick tracking', () => {
      it('should track the latest tick number from all event types', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        expect(result.current.lastTick).toBe(0);

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent({ tick: 10 }));
        });
        expect(result.current.lastTick).toBe(10);

        act(() => {
          triggerSocketEvent('NEWS', createNewsEvent({ tick: 25 }));
        });
        expect(result.current.lastTick).toBe(25);

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(50, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 0 },
          ]));
        });
        expect(result.current.lastTick).toBe(50);
      });
    });

    describe('onItem callback', () => {
      it('should call onItem callback for each processed item', () => {
        const onItem = vi.fn();
        const { result } = renderHook(() =>
          useLiveFeed({ autoConnect: false, onItem })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent({ id: 'callback-trade' }));
        });

        expect(onItem).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'trade-callback-trade',
            type: 'trade',
          })
        );
      });

      it('should not call onItem for filtered-out items', () => {
        const onItem = vi.fn();
        const { result } = renderHook(() =>
          useLiveFeed({ autoConnect: false, onItem, types: ['news'] })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent());
        });

        expect(onItem).not.toHaveBeenCalled();
      });
    });

    describe('clearFeed functionality', () => {
      it('should clear all items when clearFeed is called', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent());
          triggerSocketEvent('NEWS', createNewsEvent());
        });

        expect(result.current.items).toHaveLength(2);

        act(() => {
          result.current.clearFeed();
        });

        expect(result.current.items).toHaveLength(0);
        expect(result.current.lastTick).toBe(0);
      });
    });

    describe('getItemsByType functionality', () => {
      it('should return items filtered by type', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('TRADE', createTradeEvent({ id: 't1' }));
          triggerSocketEvent('NEWS', createNewsEvent({ id: 'n1' }));
          triggerSocketEvent('TRADE', createTradeEvent({ id: 't2' }));
          triggerSocketEvent('ALERT', createAlertEvent({ id: 'a1' }));
        });

        const trades = result.current.getItemsByType('trade');
        expect(trades).toHaveLength(2);
        expect(trades.every(item => item.type === 'trade')).toBe(true);

        const news = result.current.getItemsByType('news');
        expect(news).toHaveLength(1);
      });
    });
  });

  describe('useMarketData hook integration', () => {
    describe('receives and processes price data', () => {
      it('should update prices from PRICE_UPDATE events', () => {
        const { result } = renderHook(() => useMarketData({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const priceEvent = createPriceUpdateEvent(42, [
          { symbol: 'APEX', price: 156.78, change: 6.78, changePercent: 4.52, volume: 100000 },
          { symbol: 'BLCK', price: 42.50, change: -1.50, changePercent: -3.41, volume: 50000 },
        ]);

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', priceEvent);
        });

        expect(result.current.prices.size).toBe(2);
        expect(result.current.lastTick).toBe(42);

        const apexPrice = result.current.getPrice('APEX');
        expect(apexPrice?.price).toBe(156.78);
        expect(apexPrice?.change).toBe(6.78);
        expect(apexPrice?.changePercent).toBe(4.52);

        const blckPrice = result.current.getPrice('BLCK');
        expect(blckPrice?.price).toBe(42.50);
        expect(blckPrice?.change).toBe(-1.50);
      });

      it('should track price history over multiple updates', () => {
        const { result } = renderHook(() => useMarketData({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        // Send multiple price updates
        const prices = [100, 102, 98, 105, 110];
        prices.forEach((price, i) => {
          act(() => {
            triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(i + 1, [
              { symbol: 'APEX', price, change: price - 100, changePercent: (price - 100) / 100 * 100, volume: 1000 },
            ]));
          });
        });

        const history = result.current.getPriceHistory('APEX');
        expect(history).toEqual([100, 102, 98, 105, 110]);
      });

      it('should track high/low prices correctly', () => {
        const { result } = renderHook(() => useMarketData({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        const priceSequence = [100, 110, 95, 105, 88, 120];
        priceSequence.forEach((price, i) => {
          act(() => {
            triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(i + 1, [
              { symbol: 'APEX', price, change: 0, changePercent: 0, volume: 100 },
            ]));
          });
        });

        const priceData = result.current.getPrice('APEX');
        expect(priceData?.high).toBe(120);
        expect(priceData?.low).toBe(88);
      });

      it('should accumulate volume across updates', () => {
        const { result } = renderHook(() => useMarketData({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 5000 },
          ]));
        });

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(2, [
            { symbol: 'APEX', price: 101, change: 1, changePercent: 1, volume: 3000 },
          ]));
        });

        expect(result.current.getPrice('APEX')?.volume).toBe(8000);
      });

      it('should call onPriceUpdate callback with updated prices', () => {
        const onPriceUpdate = vi.fn();
        const { result } = renderHook(() =>
          useMarketData({ autoConnect: false, onPriceUpdate })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(42, [
            { symbol: 'APEX', price: 150, change: 5, changePercent: 3.45, volume: 10000 },
          ]));
        });

        expect(onPriceUpdate).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              symbol: 'APEX',
              price: 150,
            }),
          ])
        );
      });
    });

    describe('symbol filtering', () => {
      it('should only track specified symbols', () => {
        const { result } = renderHook(() =>
          useMarketData({ autoConnect: false, symbols: ['APEX', 'BLCK'] })
        );

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 100 },
            { symbol: 'BLCK', price: 50, change: 0, changePercent: 0, volume: 100 },
            { symbol: 'NXUS', price: 75, change: 0, changePercent: 0, volume: 100 },
          ]));
        });

        expect(result.current.prices.size).toBe(2);
        expect(result.current.getPrice('APEX')).toBeDefined();
        expect(result.current.getPrice('BLCK')).toBeDefined();
        expect(result.current.getPrice('NXUS')).toBeUndefined();
      });
    });

    describe('priceList convenience accessor', () => {
      it('should return prices as an array', () => {
        const { result } = renderHook(() => useMarketData({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        act(() => {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(1, [
            { symbol: 'APEX', price: 150, change: 5, changePercent: 3.45, volume: 10000 },
            { symbol: 'BLCK', price: 45, change: -2, changePercent: -4.26, volume: 5000 },
          ]));
        });

        expect(result.current.priceList).toHaveLength(2);
        expect(result.current.priceList).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ symbol: 'APEX' }),
            expect.objectContaining({ symbol: 'BLCK' }),
          ])
        );
      });
    });

    describe('maxPriceHistory limit', () => {
      it('should limit price history to maxPriceHistory', () => {
        const { result } = renderHook(() =>
          useMarketData({ autoConnect: false, maxPriceHistory: 3 })
        );

        act(() => {
          result.current.connect();
        });

        // Add 5 price updates
        for (let i = 1; i <= 5; i++) {
          act(() => {
            triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(i, [
              { symbol: 'APEX', price: 100 + i, change: i, changePercent: i, volume: 100 },
            ]));
          });
        }

        const history = result.current.getPriceHistory('APEX');
        expect(history).toHaveLength(3);
        // Should keep the most recent 3 prices
        expect(history).toEqual([103, 104, 105]);
      });
    });
  });

  describe('connection state handling', () => {
    describe('auto-subscription on connect', () => {
      it('should auto-subscribe useLiveFeed to feed channels when connected', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        mockSocket.connected = true;
        act(() => {
          triggerSocketEvent('connect');
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
          channels: ['trades', 'news', 'events', 'prices'],
        });
      });

      it('should auto-subscribe useMarketData to market channels when connected', () => {
        const { result } = renderHook(() => useMarketData({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        mockSocket.connected = true;
        act(() => {
          triggerSocketEvent('connect');
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
          channels: ['prices', 'market:all'],
        });
      });

      it('should re-subscribe on reconnection for useLiveFeed', () => {
        const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

        act(() => {
          result.current.connect();
        });

        mockSocket.connected = true;
        act(() => {
          triggerSocketEvent('connect');
        });

        const initialSubscribeCalls = mockSocket.emit.mock.calls.filter(
          (call) => call[0] === 'SUBSCRIBE'
        ).length;

        // Simulate disconnect and reconnect
        mockSocket.connected = false;
        act(() => {
          triggerSocketEvent('disconnect', 'transport close');
        });

        mockSocket.connected = true;
        act(() => {
          triggerSocketEvent('connect');
        });

        const totalSubscribeCalls = mockSocket.emit.mock.calls.filter(
          (call) => call[0] === 'SUBSCRIBE'
        ).length;

        // Should have subscribed twice (initial + after reconnect)
        expect(totalSubscribeCalls).toBe(initialSubscribeCalls + 1);
      });
    });
  });

  describe('data integrity', () => {
    it('should preserve event order during rapid updates', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const eventIds: string[] = [];
      for (let i = 0; i < 100; i++) {
        eventIds.push(`integrity-${i}`);
      }

      // Send all events rapidly
      act(() => {
        eventIds.forEach((id, i) => {
          triggerSocketEvent('TRADE', createTradeEvent({ id, tick: i }));
        });
      });

      // Verify events are in correct order (newest first)
      expect(result.current.items[0].id).toBe('trade-integrity-99');
      expect(result.current.items[99].id).toBe('trade-integrity-0');
    });

    it('should handle mixed event types without data corruption', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerSocketEvent('TRADE', createTradeEvent({ id: 'mixed-1', symbol: 'APEX', price: 100 }));
        triggerSocketEvent('NEWS', createNewsEvent({ id: 'mixed-2', headline: 'Test News' }));
        triggerSocketEvent('ALERT', createAlertEvent({ id: 'mixed-3', message: 'Test Alert' }));
        triggerSocketEvent('ORDER_FILLED', createOrderFilledEvent({ orderId: 'mixed-4' }));
        triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(5, [
          { symbol: 'TEST', price: 50, change: 1, changePercent: 2, volume: 100 },
        ]));
      });

      // Verify each item has correct type and content
      const trade = result.current.items.find(i => i.id === 'trade-mixed-1');
      const news = result.current.items.find(i => i.id === 'news-mixed-2');
      const alert = result.current.items.find(i => i.id.includes('alert'));
      const order = result.current.items.find(i => i.id === 'order-mixed-4');
      const price = result.current.items.find(i => i.id.includes('price-TEST'));

      expect(trade?.type).toBe('trade');
      expect(trade?.content).toContain('APEX');

      expect(news?.type).toBe('news');
      expect(news?.content).toBe('Test News');

      expect(alert?.type).toBe('alert');
      expect(alert?.content).toBe('Test Alert');

      expect(order?.type).toBe('order');

      expect(price?.type).toBe('price');
      expect(price?.content).toContain('TEST');
    });

    it('should maintain price data consistency across updates', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      // Send many updates rapidly
      act(() => {
        for (let i = 0; i < 100; i++) {
          triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(i, [
            { symbol: 'APEX', price: 100 + i, change: i, changePercent: i, volume: 100 },
            { symbol: 'BLCK', price: 50 + i, change: i, changePercent: i, volume: 50 },
          ]));
        }
      });

      // Verify final state is consistent
      expect(result.current.getPrice('APEX')?.price).toBe(199);
      expect(result.current.getPrice('BLCK')?.price).toBe(149);
      expect(result.current.lastTick).toBe(99);
    });
  });

  describe('combined feed and market data scenarios', () => {
    it('should handle simultaneous updates to both hooks', () => {
      const { result: feedResult } = renderHook(() => useLiveFeed({ autoConnect: false }));
      const { result: marketResult } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        feedResult.current.connect();
        marketResult.current.connect();
      });

      // Send events that affect both hooks
      act(() => {
        triggerSocketEvent('TRADE', createTradeEvent({ symbol: 'APEX', price: 150, quantity: 100 }));
        triggerSocketEvent('PRICE_UPDATE', createPriceUpdateEvent(42, [
          { symbol: 'APEX', price: 150, change: 5, changePercent: 3.45, volume: 10000 },
        ]));
      });

      // Feed should have trade and price items
      expect(feedResult.current.items.length).toBeGreaterThanOrEqual(1);

      // Market data should have price data
      expect(marketResult.current.getPrice('APEX')?.price).toBe(150);
    });
  });
});
