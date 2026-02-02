'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useWebSocket, type UseWebSocketOptions } from './useWebSocket';
import type {
  WSPriceUpdate,
  WSMarketUpdate,
  WSTrade,
} from '@wallstreetsim/types';

export interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  lastUpdate: Date;
}

export interface MarketDataState {
  prices: Map<string, PriceData>;
  priceHistory: Map<string, number[]>;
  lastTick: number;
  lastTradesBySymbol: Map<string, WSTrade['payload']>;
}

export interface UseMarketDataOptions extends UseWebSocketOptions {
  symbols?: string[];
  maxTradeHistory?: number;
  maxPriceHistory?: number;
  onPriceUpdate?: (prices: PriceData[]) => void;
  onTrade?: (trade: WSTrade['payload']) => void;
}

export interface UseMarketDataReturn {
  prices: Map<string, PriceData>;
  priceList: PriceData[];
  priceHistory: Map<string, number[]>;
  getPriceHistory: (symbol: string) => number[];
  lastTick: number;
  getPrice: (symbol: string) => PriceData | undefined;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  connect: () => void;
  disconnect: () => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
}

const INITIAL_STATE: MarketDataState = {
  prices: new Map(),
  priceHistory: new Map(),
  lastTick: 0,
  lastTradesBySymbol: new Map(),
};

const DEFAULT_MAX_PRICE_HISTORY = 50;

export function useMarketData(options: UseMarketDataOptions = {}): UseMarketDataReturn {
  const {
    symbols,
    maxTradeHistory = 100,
    maxPriceHistory = DEFAULT_MAX_PRICE_HISTORY,
    onPriceUpdate,
    onTrade,
    ...wsOptions
  } = options;

  const [state, setState] = useState<MarketDataState>(INITIAL_STATE);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const onTradeRef = useRef(onTrade);

  // Keep refs up to date
  useEffect(() => {
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onPriceUpdate]);

  useEffect(() => {
    onTradeRef.current = onTrade;
  }, [onTrade]);

  const handlePriceUpdate = useCallback(
    (message: WSPriceUpdate) => {
      const { tick, prices } = message.payload;

      setState((prev) => {
        const newPrices = new Map(prev.prices);
        const newPriceHistory = new Map(prev.priceHistory);
        const updatedPrices: PriceData[] = [];

        for (const priceUpdate of prices) {
          // Filter by symbols if specified
          if (symbols && symbols.length > 0 && !symbols.includes(priceUpdate.symbol)) {
            continue;
          }

          const existing = newPrices.get(priceUpdate.symbol);
          const newPrice: PriceData = {
            symbol: priceUpdate.symbol,
            price: priceUpdate.price,
            change: priceUpdate.change,
            changePercent: priceUpdate.changePercent,
            volume: (existing?.volume ?? 0) + priceUpdate.volume,
            high: Math.max(existing?.high ?? priceUpdate.price, priceUpdate.price),
            low: Math.min(existing?.low ?? priceUpdate.price, priceUpdate.price),
            lastUpdate: new Date(),
          };

          newPrices.set(priceUpdate.symbol, newPrice);
          updatedPrices.push(newPrice);

          // Update price history
          const history = newPriceHistory.get(priceUpdate.symbol) ?? [];
          const updatedHistory = [...history, priceUpdate.price];
          // Trim to max length
          if (updatedHistory.length > maxPriceHistory) {
            updatedHistory.shift();
          }
          newPriceHistory.set(priceUpdate.symbol, updatedHistory);
        }

        if (updatedPrices.length > 0) {
          onPriceUpdateRef.current?.(updatedPrices);
        }

        return {
          ...prev,
          prices: newPrices,
          priceHistory: newPriceHistory,
          lastTick: tick,
        };
      });
    },
    [symbols, maxPriceHistory]
  );

  const handleMarketUpdate = useCallback(
    (message: WSMarketUpdate) => {
      const update = message.payload;

      // Filter by symbols if specified
      if (symbols && symbols.length > 0 && !symbols.includes(update.symbol)) {
        return;
      }

      setState((prev) => {
        const newPrices = new Map(prev.prices);
        const newPriceHistory = new Map(prev.priceHistory);
        const existing = newPrices.get(update.symbol);
        const newPrice: PriceData = {
          symbol: update.symbol,
          price: update.price,
          change: update.change,
          changePercent: update.changePercent,
          volume: (existing?.volume ?? 0) + update.volume,
          high: Math.max(existing?.high ?? update.price, update.price),
          low: Math.min(existing?.low ?? update.price, update.price),
          lastUpdate: new Date(),
        };

        newPrices.set(update.symbol, newPrice);
        onPriceUpdateRef.current?.([newPrice]);

        // Update price history
        const history = newPriceHistory.get(update.symbol) ?? [];
        const updatedHistory = [...history, update.price];
        if (updatedHistory.length > maxPriceHistory) {
          updatedHistory.shift();
        }
        newPriceHistory.set(update.symbol, updatedHistory);

        return {
          ...prev,
          prices: newPrices,
          priceHistory: newPriceHistory,
        };
      });
    },
    [symbols, maxPriceHistory]
  );

  const handleTrade = useCallback(
    (message: WSTrade) => {
      const trade = message.payload;

      // Filter by symbols if specified
      if (symbols && symbols.length > 0 && !symbols.includes(trade.symbol)) {
        return;
      }

      setState((prev) => {
        const newLastTrades = new Map(prev.lastTradesBySymbol);
        newLastTrades.set(trade.symbol, trade);

        // Limit size of trade map
        if (newLastTrades.size > maxTradeHistory) {
          const firstKey = newLastTrades.keys().next().value;
          if (firstKey) {
            newLastTrades.delete(firstKey);
          }
        }

        return {
          ...prev,
          lastTradesBySymbol: newLastTrades,
        };
      });

      onTradeRef.current?.(trade);
    },
    [symbols, maxTradeHistory]
  );

  // Store subscribe function in ref to avoid re-creating handleConnect
  const subscribeRef = useRef<(channels: string[]) => void>(() => {});

  // Auto-subscribe to prices channel on connect
  const handleConnect = useCallback(() => {
    // Build list of channels to subscribe to
    const channels: string[] = ['prices'];

    // If specific symbols are requested, also subscribe to symbol-specific channels
    if (symbols && symbols.length > 0) {
      for (const symbol of symbols) {
        channels.push(`market:${symbol}`);
      }
    } else {
      // Subscribe to all market updates if no specific symbols
      channels.push('market:all');
    }

    subscribeRef.current(channels);
  }, [symbols]);

  const {
    status,
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  } = useWebSocket(
    {
      onPriceUpdate: handlePriceUpdate,
      onMarketUpdate: handleMarketUpdate,
      onTrade: handleTrade,
      onConnect: handleConnect,
    },
    wsOptions
  );

  // Update subscribe ref when subscribe function changes
  subscribeRef.current = subscribe;

  const getPrice = useCallback(
    (symbol: string): PriceData | undefined => {
      return state.prices.get(symbol);
    },
    [state.prices]
  );

  const getPriceHistory = useCallback(
    (symbol: string): number[] => {
      return state.priceHistory.get(symbol) ?? [];
    },
    [state.priceHistory]
  );

  const priceList = useMemo(
    () => Array.from(state.prices.values()),
    [state.prices]
  );

  return useMemo(
    () => ({
      prices: state.prices,
      priceList,
      priceHistory: state.priceHistory,
      getPriceHistory,
      lastTick: state.lastTick,
      getPrice,
      isConnected,
      connectionStatus: status,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
    }),
    [state.prices, priceList, state.priceHistory, getPriceHistory, state.lastTick, getPrice, isConnected, status, connect, disconnect, subscribe, unsubscribe]
  );
}
