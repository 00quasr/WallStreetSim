import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveFeed } from './useLiveFeed';
import type { WSTrade, WSNews, WSAlert, WSInvestigation, WSMarginCall, WSOrderFilled, WSPriceUpdate } from '@wallstreetsim/types';

// Store event handlers for later invocation
const eventHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

// Mock socket.io-client
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

// Helper to trigger an event
function triggerEvent(event: string, ...args: unknown[]) {
  const handlers = eventHandlers[event] || [];
  handlers.forEach((handler) => handler(...args));
}

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

function createMockTrade(id: string, overrides?: Partial<WSTrade['payload']>): WSTrade {
  return {
    type: 'TRADE',
    timestamp: new Date().toISOString(),
    payload: {
      id,
      symbol: 'APEX',
      buyerId: 'agent-1',
      sellerId: 'agent-2',
      buyerOrderId: 'order-1',
      sellerOrderId: 'order-2',
      price: 150.50,
      quantity: 100,
      tick: 1,
      createdAt: new Date(),
      ...overrides,
    },
  };
}

function createMockNews(id: string, overrides?: Partial<WSNews['payload']>): WSNews {
  return {
    type: 'NEWS',
    timestamp: new Date().toISOString(),
    payload: {
      id,
      tick: 1,
      headline: 'Breaking news headline',
      content: 'Full article content',
      category: 'market',
      sentiment: 0.5,
      agentIds: [],
      symbols: ['APEX'],
      createdAt: new Date(),
      isBreaking: false,
      ...overrides,
    },
  };
}

function createMockAlert(id: string, overrides?: Partial<WSAlert['payload']>): WSAlert {
  return {
    type: 'ALERT',
    timestamp: new Date().toISOString(),
    payload: {
      id,
      agentId: 'agent-1',
      type: 'margin_call',
      message: 'Margin call warning',
      severity: 'warning',
      tick: 1,
      createdAt: new Date(),
      acknowledged: false,
      ...overrides,
    },
  };
}

function createMockInvestigation(
  investigationId: string,
  overrides?: Partial<WSInvestigation['payload']>
): WSInvestigation {
  return {
    type: 'INVESTIGATION',
    timestamp: new Date().toISOString(),
    payload: {
      investigationId,
      status: 'opened',
      crimeType: 'insider_trading',
      message: 'SEC opens investigation',
      tick: 1,
      ...overrides,
    },
  };
}

function createMockMarginCall(tick: number, overrides?: Partial<WSMarginCall['payload']>): WSMarginCall {
  return {
    type: 'MARGIN_CALL',
    timestamp: new Date().toISOString(),
    payload: {
      marginUsed: 80000,
      marginLimit: 100000,
      portfolioValue: 150000,
      message: 'Margin call triggered',
      tick,
      ...overrides,
    },
  };
}

function createMockOrderFilled(orderId: string, overrides?: Partial<WSOrderFilled['payload']>): WSOrderFilled {
  return {
    type: 'ORDER_FILLED',
    timestamp: new Date().toISOString(),
    payload: {
      orderId,
      symbol: 'APEX',
      side: 'BUY',
      quantity: 100,
      price: 150.50,
      tick: 1,
      ...overrides,
    },
  };
}

function createMockPriceUpdate(tick: number, overrides?: Partial<WSPriceUpdate['payload']>): WSPriceUpdate {
  return {
    type: 'PRICE_UPDATE',
    timestamp: new Date().toISOString(),
    payload: {
      tick,
      prices: [
        {
          symbol: 'APEX',
          price: 155.00,
          change: 4.50,
          changePercent: 2.99,
          volume: 50000,
        },
      ],
      ...overrides,
    },
  };
}

describe('useLiveFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key]);
    mockSocket.connected = false;
    mockSocket.id = 'test-socket-id';
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(result.current.items).toEqual([]);
      expect(result.current.lastTick).toBe(0);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should auto-connect by default', () => {
      renderHook(() => useLiveFeed());

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should not auto-connect when autoConnect is false', () => {
      renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });
  });

  describe('trade handling', () => {
    it('should handle TRADE events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockTrade = createMockTrade('trade-1', {
        symbol: 'APEX',
        price: 156.78,
        quantity: 10000,
      });

      act(() => {
        triggerEvent('TRADE', mockTrade);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('trade');
      expect(result.current.items[0].content).toContain('APEX');
      expect(result.current.items[0].content).toContain('10,000');
      expect(result.current.items[0].content).toContain('$156.78');
    });

    it('should filter trades by symbols', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, symbols: ['APEX'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1', { symbol: 'APEX' }));
        triggerEvent('TRADE', createMockTrade('trade-2', { symbol: 'BLCK' }));
        triggerEvent('TRADE', createMockTrade('trade-3', { symbol: 'APEX' }));
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.every((item) => item.content.includes('APEX'))).toBe(true);
    });
  });

  describe('news handling', () => {
    it('should handle NEWS events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockNews = createMockNews('news-1', {
        headline: 'APEX reports record earnings',
      });

      act(() => {
        triggerEvent('NEWS', mockNews);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('news');
      expect(result.current.items[0].content).toBe('APEX reports record earnings');
    });

    it('should include BREAKING prefix for breaking news', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockNews = createMockNews('news-1', {
        headline: 'Market crash',
        isBreaking: true,
      });

      act(() => {
        triggerEvent('NEWS', mockNews);
      });

      expect(result.current.items[0].content).toBe('BREAKING: Market crash');
    });

    it('should filter news by symbols', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, symbols: ['APEX'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('NEWS', createMockNews('news-1', { symbols: ['APEX'] }));
        triggerEvent('NEWS', createMockNews('news-2', { symbols: ['BLCK'] }));
        triggerEvent('NEWS', createMockNews('news-3', { symbols: ['APEX', 'NXUS'] }));
      });

      expect(result.current.items).toHaveLength(2);
    });
  });

  describe('alert handling', () => {
    it('should handle ALERT events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockAlert = createMockAlert('alert-1', {
        message: 'Critical margin warning',
      });

      act(() => {
        triggerEvent('ALERT', mockAlert);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('alert');
      expect(result.current.items[0].content).toBe('Critical margin warning');
    });
  });

  describe('investigation handling', () => {
    it('should handle INVESTIGATION events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockInvestigation = createMockInvestigation('inv-1', {
        message: 'SEC opens investigation into ShadowTrader',
      });

      act(() => {
        triggerEvent('INVESTIGATION', mockInvestigation);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('event');
      expect(result.current.items[0].content).toBe('SEC opens investigation into ShadowTrader');
    });
  });

  describe('margin call handling', () => {
    it('should handle MARGIN_CALL events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockMarginCall = createMockMarginCall(42, {
        message: 'Margin call triggered - deposit required',
      });

      act(() => {
        triggerEvent('MARGIN_CALL', mockMarginCall);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('alert');
      expect(result.current.items[0].content).toBe('Margin call triggered - deposit required');
    });
  });

  describe('order filled handling', () => {
    it('should handle ORDER_FILLED events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockOrderFilled = createMockOrderFilled('order-1', {
        symbol: 'APEX',
        side: 'BUY',
        quantity: 500,
        price: 156.78,
      });

      act(() => {
        triggerEvent('ORDER_FILLED', mockOrderFilled);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('order');
      expect(result.current.items[0].content).toContain('BUY');
      expect(result.current.items[0].content).toContain('APEX');
      expect(result.current.items[0].content).toContain('500');
      expect(result.current.items[0].content).toContain('$156.78');
    });

    it('should filter order filled by symbols', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, symbols: ['APEX'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-1', { symbol: 'APEX' }));
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-2', { symbol: 'BLCK' }));
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-3', { symbol: 'APEX' }));
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.every((item) => item.content.includes('APEX'))).toBe(true);
    });

    it('should display SELL orders correctly', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-1', { side: 'SELL' }));
      });

      expect(result.current.items[0].content).toContain('SELL');
    });
  });

  describe('price update handling', () => {
    it('should handle PRICE_UPDATE events', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(10, {
        prices: [
          {
            symbol: 'APEX',
            price: 160.00,
            change: 5.00,
            changePercent: 3.23,
            volume: 100000,
          },
        ],
      });

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].type).toBe('price');
      expect(result.current.items[0].content).toContain('APEX');
      expect(result.current.items[0].content).toContain('$160.00');
      expect(result.current.items[0].content).toContain('+5.00');
      expect(result.current.items[0].content).toContain('+3.23%');
    });

    it('should handle multiple prices in one update', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(10, {
        prices: [
          { symbol: 'APEX', price: 160.00, change: 5.00, changePercent: 3.23, volume: 100000 },
          { symbol: 'BLCK', price: 85.50, change: -2.00, changePercent: -2.28, volume: 50000 },
        ],
      });

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.map((item) => item.type)).toEqual(['price', 'price']);
    });

    it('should filter price updates by symbols', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, symbols: ['APEX'] })
      );

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(10, {
        prices: [
          { symbol: 'APEX', price: 160.00, change: 5.00, changePercent: 3.23, volume: 100000 },
          { symbol: 'BLCK', price: 85.50, change: -2.00, changePercent: -2.28, volume: 50000 },
        ],
      });

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].content).toContain('APEX');
    });

    it('should display negative price changes correctly', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(10, {
        prices: [
          { symbol: 'APEX', price: 145.00, change: -5.00, changePercent: -3.33, volume: 100000 },
        ],
      });

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(result.current.items[0].content).toContain('-5.00');
      expect(result.current.items[0].content).toContain('-3.33%');
    });

    it('should update lastTick from price update', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('PRICE_UPDATE', createMockPriceUpdate(99));
      });

      expect(result.current.lastTick).toBe(99);
    });
  });

  describe('filtering by type', () => {
    it('should filter items by type', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, types: ['trade', 'news'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
        triggerEvent('NEWS', createMockNews('news-1'));
        triggerEvent('ALERT', createMockAlert('alert-1'));
        triggerEvent('INVESTIGATION', createMockInvestigation('inv-1'));
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.map((item) => item.type)).toEqual(['news', 'trade']);
    });

    it('should accept all types when no filter is specified', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
        triggerEvent('NEWS', createMockNews('news-1'));
        triggerEvent('ALERT', createMockAlert('alert-1'));
        triggerEvent('INVESTIGATION', createMockInvestigation('inv-1'));
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-1'));
        triggerEvent('PRICE_UPDATE', createMockPriceUpdate(1));
      });

      expect(result.current.items).toHaveLength(6);
    });

    it('should filter to only order and price types', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, types: ['order', 'price'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
        triggerEvent('NEWS', createMockNews('news-1'));
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-1'));
        triggerEvent('PRICE_UPDATE', createMockPriceUpdate(1));
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.map((item) => item.type)).toEqual(['price', 'order']);
    });
  });

  describe('item ordering', () => {
    it('should prepend new items to the list', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-2'));
      });

      expect(result.current.items[0].id).toBe('trade-trade-2');
      expect(result.current.items[1].id).toBe('trade-trade-1');
    });
  });

  describe('maxItems limit', () => {
    it('should limit items to maxItems', () => {
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, maxItems: 3 })
      );

      act(() => {
        result.current.connect();
      });

      for (let i = 1; i <= 5; i++) {
        act(() => {
          triggerEvent('TRADE', createMockTrade(`trade-${i}`, { tick: i }));
        });
      }

      expect(result.current.items).toHaveLength(3);
      expect(result.current.items[0].id).toBe('trade-trade-5');
      expect(result.current.items[2].id).toBe('trade-trade-3');
    });
  });

  describe('lastTick tracking', () => {
    it('should update lastTick from trade', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1', { tick: 42 }));
      });

      expect(result.current.lastTick).toBe(42);
    });

    it('should update lastTick from news', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('NEWS', createMockNews('news-1', { tick: 100 }));
      });

      expect(result.current.lastTick).toBe(100);
    });
  });

  describe('getItemsByType', () => {
    it('should return items filtered by type', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
        triggerEvent('NEWS', createMockNews('news-1'));
        triggerEvent('TRADE', createMockTrade('trade-2'));
        triggerEvent('ALERT', createMockAlert('alert-1'));
      });

      const trades = result.current.getItemsByType('trade');

      expect(trades).toHaveLength(2);
      expect(trades.every((item) => item.type === 'trade')).toBe(true);
    });

    it('should return empty array for non-matching type', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
      });

      const events = result.current.getItemsByType('event');

      expect(events).toEqual([]);
    });
  });

  describe('clearFeed', () => {
    it('should clear all items', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
        triggerEvent('NEWS', createMockNews('news-1'));
      });

      expect(result.current.items).toHaveLength(2);

      act(() => {
        result.current.clearFeed();
      });

      expect(result.current.items).toEqual([]);
      expect(result.current.lastTick).toBe(0);
    });
  });

  describe('onItem callback', () => {
    it('should call onItem callback for each new item', () => {
      const onItem = vi.fn();
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, onItem })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
      });

      expect(onItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'trade-trade-1',
          type: 'trade',
        })
      );
    });

    it('should not call onItem for filtered out items', () => {
      const onItem = vi.fn();
      const { result } = renderHook(() =>
        useLiveFeed({ autoConnect: false, onItem, types: ['news'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1'));
      });

      expect(onItem).not.toHaveBeenCalled();
    });
  });

  describe('connection management', () => {
    it('should expose connect function', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(typeof result.current.connect).toBe('function');

      act(() => {
        result.current.connect();
      });

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(typeof result.current.disconnect).toBe('function');

      act(() => {
        result.current.connect();
      });

      act(() => {
        result.current.disconnect();
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should expose subscribe function', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(typeof result.current.subscribe).toBe('function');

      act(() => {
        result.current.connect();
      });

      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      act(() => {
        result.current.subscribe(['trades:APEX']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', { channels: ['trades:APEX'] });
    });

    it('should expose unsubscribe function', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      expect(typeof result.current.unsubscribe).toBe('function');

      act(() => {
        result.current.connect();
      });

      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      act(() => {
        result.current.unsubscribe(['trades:APEX']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('UNSUBSCRIBE', { channels: ['trades:APEX'] });
    });

    it('should update isConnected when connected', () => {
      mockSocket.connected = true;

      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('connect');
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionStatus).toBe('connected');
    });
  });

  describe('mixed event handling', () => {
    it('should correctly handle multiple event types', () => {
      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('TRADE', createMockTrade('trade-1', { tick: 1 }));
        triggerEvent('NEWS', createMockNews('news-1', { tick: 2, isBreaking: true }));
        triggerEvent('ALERT', createMockAlert('alert-1'));
        triggerEvent('INVESTIGATION', createMockInvestigation('inv-1', { tick: 3 }));
        triggerEvent('MARGIN_CALL', createMockMarginCall(4));
        triggerEvent('ORDER_FILLED', createMockOrderFilled('order-1', { tick: 5 }));
        triggerEvent('PRICE_UPDATE', createMockPriceUpdate(6));
      });

      expect(result.current.items).toHaveLength(7);

      const types = result.current.items.map((item) => item.type);
      expect(types).toContain('trade');
      expect(types).toContain('news');
      expect(types).toContain('alert');
      expect(types).toContain('event');
      expect(types).toContain('order');
      expect(types).toContain('price');
    });
  });

  describe('auto-subscription', () => {
    it('should auto-subscribe to feed channels when connected', () => {
      mockSocket.connected = true;

      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('connect');
      });

      // Should auto-subscribe to feed channels
      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
        channels: ['trades', 'news', 'events', 'prices'],
      });
    });

    it('should only subscribe once per connection', () => {
      mockSocket.connected = true;

      const { result, rerender } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('connect');
      });

      const subscribeCallCount = mockSocket.emit.mock.calls.filter(
        (call) => call[0] === 'SUBSCRIBE'
      ).length;

      // Re-render should not trigger another subscription
      rerender();

      const newSubscribeCallCount = mockSocket.emit.mock.calls.filter(
        (call) => call[0] === 'SUBSCRIBE'
      ).length;

      expect(newSubscribeCallCount).toBe(subscribeCallCount);
    });

    it('should re-subscribe after disconnect and reconnect', () => {
      mockSocket.connected = true;

      const { result } = renderHook(() => useLiveFeed({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent('connect');
      });

      const initialSubscribeCalls = mockSocket.emit.mock.calls.filter(
        (call) => call[0] === 'SUBSCRIBE'
      ).length;

      expect(initialSubscribeCalls).toBe(1);

      // Simulate disconnect
      mockSocket.connected = false;
      act(() => {
        triggerEvent('disconnect', 'transport close');
      });

      // Simulate reconnect
      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      const totalSubscribeCalls = mockSocket.emit.mock.calls.filter(
        (call) => call[0] === 'SUBSCRIBE'
      ).length;

      // Should have subscribed twice (initial + after reconnect)
      expect(totalSubscribeCalls).toBe(2);
    });
  });
});
