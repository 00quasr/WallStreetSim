import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarketData } from './useMarketData';
import type { WSPriceUpdate, WSMarketUpdate, WSTrade } from '@wallstreetsim/types';

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

function createMockPriceUpdate(
  tick: number,
  prices: Array<{
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
  }>
): WSPriceUpdate {
  return {
    type: 'PRICE_UPDATE',
    timestamp: new Date().toISOString(),
    payload: {
      tick,
      prices,
    },
  };
}

function createMockMarketUpdate(data: {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}): WSMarketUpdate {
  return {
    type: 'MARKET_UPDATE',
    timestamp: new Date().toISOString(),
    payload: data,
  };
}

function createMockTrade(data: {
  id: string;
  symbol: string;
  buyerId: string;
  sellerId: string;
  price: number;
  quantity: number;
  tick: number;
}): WSTrade {
  return {
    type: 'TRADE',
    timestamp: new Date().toISOString(),
    payload: {
      ...data,
      buyerOrderId: `order-${data.id}-buy`,
      sellerOrderId: `order-${data.id}-sell`,
      createdAt: new Date(),
    },
  };
}

describe('useMarketData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key]);
    mockSocket.connected = false;
    mockSocket.id = 'test-socket-id';
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      expect(result.current.prices.size).toBe(0);
      expect(result.current.priceList).toEqual([]);
      expect(result.current.lastTick).toBe(0);
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should auto-connect by default', () => {
      renderHook(() => useMarketData());

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should not auto-connect when autoConnect is false', () => {
      renderHook(() => useMarketData({ autoConnect: false }));

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });
  });

  describe('price updates via PRICE_UPDATE', () => {
    it('should update prices when PRICE_UPDATE is received', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(42, [
        { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 1000 },
        { symbol: 'BLCK', price: 52, change: 2, changePercent: 4, volume: 500 },
      ]);

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(result.current.prices.size).toBe(2);
      expect(result.current.lastTick).toBe(42);

      const apexPrice = result.current.getPrice('APEX');
      expect(apexPrice).toBeDefined();
      expect(apexPrice?.price).toBe(105);
      expect(apexPrice?.change).toBe(5);
      expect(apexPrice?.changePercent).toBe(5);
      expect(apexPrice?.volume).toBe(1000);

      const blckPrice = result.current.getPrice('BLCK');
      expect(blckPrice).toBeDefined();
      expect(blckPrice?.price).toBe(52);
    });

    it('should call onPriceUpdate callback when prices are updated', () => {
      const onPriceUpdate = vi.fn();
      const { result } = renderHook(() =>
        useMarketData({ autoConnect: false, onPriceUpdate })
      );

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(42, [
        { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 1000 },
      ]);

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(onPriceUpdate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'APEX',
            price: 105,
          }),
        ])
      );
    });

    it('should accumulate volume across updates', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 500 },
          ])
        );
      });

      expect(result.current.getPrice('APEX')?.volume).toBe(500);

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(2, [
            { symbol: 'APEX', price: 101, change: 1, changePercent: 1, volume: 300 },
          ])
        );
      });

      expect(result.current.getPrice('APEX')?.volume).toBe(800);
    });

    it('should track high and low prices', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      // Initial price
      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 100 },
          ])
        );
      });

      expect(result.current.getPrice('APEX')?.high).toBe(100);
      expect(result.current.getPrice('APEX')?.low).toBe(100);

      // Price goes up
      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(2, [
            { symbol: 'APEX', price: 110, change: 10, changePercent: 10, volume: 100 },
          ])
        );
      });

      expect(result.current.getPrice('APEX')?.high).toBe(110);
      expect(result.current.getPrice('APEX')?.low).toBe(100);

      // Price goes down
      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(3, [
            { symbol: 'APEX', price: 95, change: -5, changePercent: -5, volume: 100 },
          ])
        );
      });

      expect(result.current.getPrice('APEX')?.high).toBe(110);
      expect(result.current.getPrice('APEX')?.low).toBe(95);
    });

    it('should filter prices by symbols when specified', () => {
      const { result } = renderHook(() =>
        useMarketData({ autoConnect: false, symbols: ['APEX'] })
      );

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(42, [
        { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 1000 },
        { symbol: 'BLCK', price: 52, change: 2, changePercent: 4, volume: 500 },
      ]);

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
      });

      expect(result.current.prices.size).toBe(1);
      expect(result.current.getPrice('APEX')).toBeDefined();
      expect(result.current.getPrice('BLCK')).toBeUndefined();
    });
  });

  describe('price updates via MARKET_UPDATE', () => {
    it('should update prices when MARKET_UPDATE is received', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockMarketUpdate = createMockMarketUpdate({
        symbol: 'APEX',
        price: 105,
        change: 5,
        changePercent: 5,
        volume: 1000,
      });

      act(() => {
        triggerEvent('MARKET_UPDATE', mockMarketUpdate);
      });

      expect(result.current.prices.size).toBe(1);

      const apexPrice = result.current.getPrice('APEX');
      expect(apexPrice).toBeDefined();
      expect(apexPrice?.price).toBe(105);
    });

    it('should filter market updates by symbols when specified', () => {
      const { result } = renderHook(() =>
        useMarketData({ autoConnect: false, symbols: ['APEX'] })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'MARKET_UPDATE',
          createMockMarketUpdate({
            symbol: 'BLCK',
            price: 52,
            change: 2,
            changePercent: 4,
            volume: 500,
          })
        );
      });

      expect(result.current.prices.size).toBe(0);
      expect(result.current.getPrice('BLCK')).toBeUndefined();
    });
  });

  describe('trade handling', () => {
    it('should call onTrade callback when trade is received', () => {
      const onTrade = vi.fn();
      const { result } = renderHook(() =>
        useMarketData({ autoConnect: false, onTrade })
      );

      act(() => {
        result.current.connect();
      });

      const mockTrade = createMockTrade({
        id: 'trade-1',
        symbol: 'APEX',
        buyerId: 'agent-1',
        sellerId: 'agent-2',
        price: 105,
        quantity: 100,
        tick: 42,
      });

      act(() => {
        triggerEvent('TRADE', mockTrade);
      });

      expect(onTrade).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'APEX',
          price: 105,
          quantity: 100,
        })
      );
    });

    it('should filter trades by symbols when specified', () => {
      const onTrade = vi.fn();
      const { result } = renderHook(() =>
        useMarketData({ autoConnect: false, symbols: ['APEX'], onTrade })
      );

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'TRADE',
          createMockTrade({
            id: 'trade-1',
            symbol: 'BLCK',
            buyerId: 'agent-1',
            sellerId: 'agent-2',
            price: 52,
            quantity: 100,
            tick: 42,
          })
        );
      });

      expect(onTrade).not.toHaveBeenCalled();
    });
  });

  describe('priceList', () => {
    it('should return prices as an array', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const mockPriceUpdate = createMockPriceUpdate(42, [
        { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 1000 },
        { symbol: 'BLCK', price: 52, change: 2, changePercent: 4, volume: 500 },
      ]);

      act(() => {
        triggerEvent('PRICE_UPDATE', mockPriceUpdate);
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

  describe('getPrice', () => {
    it('should return price data for a specific symbol', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(42, [
            { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 1000 },
          ])
        );
      });

      const price = result.current.getPrice('APEX');
      expect(price).toBeDefined();
      expect(price?.symbol).toBe('APEX');
      expect(price?.price).toBe(105);
    });

    it('should return undefined for unknown symbol', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      const price = result.current.getPrice('UNKNOWN');
      expect(price).toBeUndefined();
    });
  });

  describe('connection management', () => {
    it('should expose connect function', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      expect(typeof result.current.connect).toBe('function');

      act(() => {
        result.current.connect();
      });

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

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
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      expect(typeof result.current.subscribe).toBe('function');

      act(() => {
        result.current.connect();
      });

      mockSocket.connected = true;

      act(() => {
        triggerEvent('connect');
      });

      act(() => {
        result.current.subscribe(['market:APEX']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
        channels: ['market:APEX'],
      });
    });

    it('should expose unsubscribe function', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      expect(typeof result.current.unsubscribe).toBe('function');

      act(() => {
        result.current.connect();
      });

      mockSocket.connected = true;

      act(() => {
        triggerEvent('connect');
      });

      act(() => {
        result.current.unsubscribe(['market:APEX']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('UNSUBSCRIBE', {
        channels: ['market:APEX'],
      });
    });

    it('should update isConnected when connected', () => {
      mockSocket.connected = true;

      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

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

  describe('price history', () => {
    it('should track price history for each symbol', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 100 },
          ])
        );
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(2, [
            { symbol: 'APEX', price: 101, change: 1, changePercent: 1, volume: 100 },
          ])
        );
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(3, [
            { symbol: 'APEX', price: 102, change: 2, changePercent: 2, volume: 100 },
          ])
        );
      });

      const history = result.current.getPriceHistory('APEX');
      expect(history).toEqual([100, 101, 102]);
    });

    it('should return empty array for unknown symbol', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      const history = result.current.getPriceHistory('UNKNOWN');
      expect(history).toEqual([]);
    });

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
          triggerEvent(
            'PRICE_UPDATE',
            createMockPriceUpdate(i, [
              { symbol: 'APEX', price: 100 + i, change: i, changePercent: i, volume: 100 },
            ])
          );
        });
      }

      const history = result.current.getPriceHistory('APEX');
      expect(history).toHaveLength(3);
      // Should keep the most recent 3 prices
      expect(history).toEqual([103, 104, 105]);
    });

    it('should track price history separately for each symbol', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 100 },
            { symbol: 'BLCK', price: 50, change: 0, changePercent: 0, volume: 100 },
          ])
        );
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(2, [
            { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 100 },
            { symbol: 'BLCK', price: 52, change: 2, changePercent: 4, volume: 100 },
          ])
        );
      });

      expect(result.current.getPriceHistory('APEX')).toEqual([100, 105]);
      expect(result.current.getPriceHistory('BLCK')).toEqual([50, 52]);
    });

    it('should track price history on MARKET_UPDATE events', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'MARKET_UPDATE',
          createMockMarketUpdate({
            symbol: 'APEX',
            price: 100,
            change: 0,
            changePercent: 0,
            volume: 100,
          })
        );
      });

      act(() => {
        triggerEvent(
          'MARKET_UPDATE',
          createMockMarketUpdate({
            symbol: 'APEX',
            price: 105,
            change: 5,
            changePercent: 5,
            volume: 100,
          })
        );
      });

      const history = result.current.getPriceHistory('APEX');
      expect(history).toEqual([100, 105]);
    });

    it('should expose priceHistory map', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(1, [
            { symbol: 'APEX', price: 100, change: 0, changePercent: 0, volume: 100 },
          ])
        );
      });

      expect(result.current.priceHistory instanceof Map).toBe(true);
      expect(result.current.priceHistory.get('APEX')).toEqual([100]);
    });
  });

  describe('lastUpdate timestamp', () => {
    it('should set lastUpdate timestamp on price updates', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const beforeUpdate = new Date();

      act(() => {
        triggerEvent(
          'PRICE_UPDATE',
          createMockPriceUpdate(42, [
            { symbol: 'APEX', price: 105, change: 5, changePercent: 5, volume: 1000 },
          ])
        );
      });

      const afterUpdate = new Date();
      const price = result.current.getPrice('APEX');

      expect(price?.lastUpdate).toBeDefined();
      expect(price?.lastUpdate.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(price?.lastUpdate.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });
  });

  describe('auto-subscription', () => {
    it('should auto-subscribe to prices and market:all channels on connect', () => {
      const { result } = renderHook(() => useMarketData({ autoConnect: false }));

      // First connect, which registers event handlers
      act(() => {
        result.current.connect();
      });

      // Then simulate the connect event
      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
        channels: ['prices', 'market:all'],
      });
    });

    it('should auto-subscribe to prices and symbol-specific channels when symbols are specified', () => {
      const { result } = renderHook(() =>
        useMarketData({ autoConnect: false, symbols: ['APEX', 'BLCK'] })
      );

      // First connect, which registers event handlers
      act(() => {
        result.current.connect();
      });

      // Then simulate the connect event
      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
        channels: ['prices', 'market:APEX', 'market:BLCK'],
      });
    });

    it('should auto-subscribe when autoConnect is true', () => {
      // autoConnect: true means the hook will call connect() on mount
      renderHook(() => useMarketData());

      // Simulate the connect event
      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', {
        channels: ['prices', 'market:all'],
      });
    });
  });
});
