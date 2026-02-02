'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useWebSocket, type UseWebSocketOptions } from './useWebSocket';
import type {
  WSTrade,
  WSNews,
  WSAlert,
  WSInvestigation,
  WSMarginCall,
  WSOrderFilled,
  WSPriceUpdate,
  Trade,
  NewsArticle,
  AgentAlert,
} from '@wallstreetsim/types';

export type FeedItemType = 'trade' | 'news' | 'event' | 'alert' | 'order' | 'price';

export interface FeedItem {
  id: string;
  timestamp: string;
  type: FeedItemType;
  content: string;
  tick?: number;
  receivedAt: Date;
}

export interface LiveFeedState {
  items: FeedItem[];
  lastTick: number;
}

export interface UseLiveFeedOptions extends UseWebSocketOptions {
  maxItems?: number;
  types?: FeedItemType[];
  symbols?: string[];
  onItem?: (item: FeedItem) => void;
}

export interface UseLiveFeedReturn {
  items: FeedItem[];
  lastTick: number;
  getItemsByType: (type: FeedItemType) => FeedItem[];
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  connect: () => void;
  disconnect: () => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
  clearFeed: () => void;
}

const DEFAULT_MAX_ITEMS = 100;

const INITIAL_STATE: LiveFeedState = {
  items: [],
  lastTick: 0,
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTradeContent(trade: Trade): string {
  const quantity = trade.quantity.toLocaleString();
  return `${trade.symbol} ${quantity} @ ${formatPrice(trade.price)}`;
}

function formatNewsContent(article: NewsArticle): string {
  const prefix = article.isBreaking ? 'BREAKING: ' : '';
  return `${prefix}${article.headline}`;
}

function formatAlertContent(alert: AgentAlert): string {
  return alert.message;
}

function formatInvestigationContent(investigation: {
  crimeType: string;
  message: string;
  status: string;
}): string {
  return investigation.message;
}

function formatMarginCallContent(marginCall: { message: string }): string {
  return marginCall.message;
}

function formatOrderFilledContent(order: WSOrderFilled['payload']): string {
  const quantity = order.quantity.toLocaleString();
  return `${order.side} ${order.symbol} ${quantity} @ ${formatPrice(order.price)}`;
}

function formatPriceChangeContent(priceUpdate: WSPriceUpdate['payload']['prices'][number]): string {
  const sign = priceUpdate.change >= 0 ? '+' : '';
  const changeStr = `${sign}${priceUpdate.change.toFixed(2)}`;
  const percentStr = `${sign}${priceUpdate.changePercent.toFixed(2)}%`;
  return `${priceUpdate.symbol} ${formatPrice(priceUpdate.price)} (${changeStr}, ${percentStr})`;
}

export function useLiveFeed(options: UseLiveFeedOptions = {}): UseLiveFeedReturn {
  const {
    maxItems = DEFAULT_MAX_ITEMS,
    types,
    symbols,
    onItem,
    ...wsOptions
  } = options;

  const [state, setState] = useState<LiveFeedState>(INITIAL_STATE);
  const onItemRef = useRef(onItem);
  const hasSubscribedRef = useRef(false);

  useEffect(() => {
    onItemRef.current = onItem;
  }, [onItem]);

  const addItem = useCallback(
    (item: FeedItem) => {
      if (types && types.length > 0 && !types.includes(item.type)) {
        return;
      }

      setState((prev) => ({
        items: [item, ...prev.items].slice(0, maxItems),
        lastTick: item.tick ?? prev.lastTick,
      }));

      onItemRef.current?.(item);
    },
    [types, maxItems]
  );

  const handleTrade = useCallback(
    (message: WSTrade) => {
      const trade = message.payload;

      if (symbols && symbols.length > 0 && !symbols.includes(trade.symbol)) {
        return;
      }

      const item: FeedItem = {
        id: `trade-${trade.id}`,
        timestamp: formatTime(new Date()),
        type: 'trade',
        content: formatTradeContent(trade),
        tick: trade.tick,
        receivedAt: new Date(),
      };

      addItem(item);
    },
    [symbols, addItem]
  );

  const handleNews = useCallback(
    (message: WSNews) => {
      const article = message.payload;

      if (symbols && symbols.length > 0) {
        const hasMatchingSymbol = article.symbols.some((s) => symbols.includes(s));
        if (!hasMatchingSymbol) {
          return;
        }
      }

      const item: FeedItem = {
        id: `news-${article.id}`,
        timestamp: formatTime(new Date()),
        type: 'news',
        content: formatNewsContent(article),
        tick: article.tick,
        receivedAt: new Date(),
      };

      addItem(item);
    },
    [symbols, addItem]
  );

  const handleAlert = useCallback(
    (message: WSAlert) => {
      const alert = message.payload;

      const item: FeedItem = {
        id: `alert-${alert.id}-${Date.now()}`,
        timestamp: formatTime(new Date()),
        type: 'alert',
        content: formatAlertContent(alert),
        receivedAt: new Date(),
      };

      addItem(item);
    },
    [addItem]
  );

  const handleInvestigation = useCallback(
    (message: WSInvestigation) => {
      const investigation = message.payload;

      const item: FeedItem = {
        id: `investigation-${investigation.investigationId}-${investigation.status}`,
        timestamp: formatTime(new Date()),
        type: 'event',
        content: formatInvestigationContent(investigation),
        tick: investigation.tick,
        receivedAt: new Date(),
      };

      addItem(item);
    },
    [addItem]
  );

  const handleMarginCall = useCallback(
    (message: WSMarginCall) => {
      const marginCall = message.payload;

      const item: FeedItem = {
        id: `margin-call-${marginCall.tick}-${Date.now()}`,
        timestamp: formatTime(new Date()),
        type: 'alert',
        content: formatMarginCallContent(marginCall),
        tick: marginCall.tick,
        receivedAt: new Date(),
      };

      addItem(item);
    },
    [addItem]
  );

  const handleOrderFilled = useCallback(
    (message: WSOrderFilled) => {
      const order = message.payload;

      if (symbols && symbols.length > 0 && !symbols.includes(order.symbol)) {
        return;
      }

      const item: FeedItem = {
        id: `order-${order.orderId}`,
        timestamp: formatTime(new Date()),
        type: 'order',
        content: formatOrderFilledContent(order),
        tick: order.tick,
        receivedAt: new Date(),
      };

      addItem(item);
    },
    [symbols, addItem]
  );

  const handlePriceUpdate = useCallback(
    (message: WSPriceUpdate) => {
      const { tick, prices } = message.payload;

      for (const priceData of prices) {
        if (symbols && symbols.length > 0 && !symbols.includes(priceData.symbol)) {
          continue;
        }

        const item: FeedItem = {
          id: `price-${priceData.symbol}-${tick}`,
          timestamp: formatTime(new Date()),
          type: 'price',
          content: formatPriceChangeContent(priceData),
          tick,
          receivedAt: new Date(),
        };

        addItem(item);
      }
    },
    [symbols, addItem]
  );

  const {
    status,
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  } = useWebSocket(
    {
      onTrade: handleTrade,
      onNews: handleNews,
      onAlert: handleAlert,
      onInvestigation: handleInvestigation,
      onMarginCall: handleMarginCall,
      onOrderFilled: handleOrderFilled,
      onPriceUpdate: handlePriceUpdate,
    },
    wsOptions
  );

  // Auto-subscribe to feed channels when connected
  useEffect(() => {
    if (isConnected && !hasSubscribedRef.current) {
      // Subscribe to all public channels that provide feed events
      // Note: 'tick' is auto-joined by the server on connection
      const feedChannels = ['trades', 'news', 'events', 'prices'];
      subscribe(feedChannels);
      hasSubscribedRef.current = true;
    }

    // Reset subscription flag on disconnect
    if (!isConnected) {
      hasSubscribedRef.current = false;
    }
  }, [isConnected, subscribe]);

  const getItemsByType = useCallback(
    (type: FeedItemType): FeedItem[] => {
      return state.items.filter((item) => item.type === type);
    },
    [state.items]
  );

  const clearFeed = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return useMemo(
    () => ({
      items: state.items,
      lastTick: state.lastTick,
      getItemsByType,
      isConnected,
      connectionStatus: status,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
      clearFeed,
    }),
    [
      state.items,
      state.lastTick,
      getItemsByType,
      isConnected,
      status,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
      clearFeed,
    ]
  );
}
