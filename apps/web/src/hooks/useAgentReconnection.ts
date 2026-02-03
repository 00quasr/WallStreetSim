'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  useWebSocket,
  type UseWebSocketOptions,
  type WebSocketEventHandlers,
  type ConnectionStatus,
} from './useWebSocket';
import { useEventReplay, type RecoveryStatus } from './useEventReplay';
import type {
  TickEventRecord,
  WorldStateCheckpoint,
  AgentPortfolioCheckpoint,
  WSTickUpdate,
  WSTrade,
  WSNews,
  WSPriceUpdate,
} from '@wallstreetsim/types';

export interface UseAgentReconnectionOptions extends UseWebSocketOptions {
  apiKey: string;
  onWorldState?: (worldState: WorldStateCheckpoint) => void;
  onPortfolio?: (portfolio: AgentPortfolioCheckpoint) => void;
  onTickEvent?: (event: TickEventRecord) => void;
  onRecoveryStart?: () => void;
  onRecoveryComplete?: (totalEvents: number) => void;
  onRecoveryError?: (error: Error) => void;
}

export interface UseAgentReconnectionReturn {
  connectionStatus: ConnectionStatus;
  recoveryStatus: RecoveryStatus;
  isConnected: boolean;
  isAuthenticated: boolean;
  isRecovering: boolean;
  agentId: string | null;
  lastKnownTick: number;
  recoveredEventCount: number;
  reconnectAttempt: number;
  latency: number | null;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
}

export function useAgentReconnection(
  handlers: WebSocketEventHandlers = {},
  options: UseAgentReconnectionOptions
): UseAgentReconnectionReturn {
  const {
    apiKey,
    onWorldState,
    onPortfolio,
    onTickEvent,
    onRecoveryStart,
    onRecoveryComplete,
    onRecoveryError,
    ...wsOptions
  } = options;

  const [lastKnownTick, setLastKnownTick] = useState(0);
  const wasConnectedRef = useRef(false);
  const handlersRef = useRef(handlers);

  // Keep handlers ref up to date
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Wrapper for tick updates to track the last known tick
  const handleTickUpdate = useCallback((data: WSTickUpdate) => {
    const tick = data.payload?.tick;
    if (typeof tick === 'number' && tick > 0) {
      setLastKnownTick((prev) => (tick > prev ? tick : prev));
    }
    handlersRef.current.onTickUpdate?.(data);
  }, []);

  // Wrapper for trades to extract tick if available
  const handleTrade = useCallback((data: WSTrade) => {
    const tick = (data.payload as { tick?: number })?.tick;
    if (typeof tick === 'number' && tick > 0) {
      setLastKnownTick((prev) => (tick > prev ? tick : prev));
    }
    handlersRef.current.onTrade?.(data);
  }, []);

  // Wrapper for news to extract tick if available
  const handleNews = useCallback((data: WSNews) => {
    const tick = (data.payload as { tick?: number })?.tick;
    if (typeof tick === 'number' && tick > 0) {
      setLastKnownTick((prev) => (tick > prev ? tick : prev));
    }
    handlersRef.current.onNews?.(data);
  }, []);

  // Wrapper for price updates to extract tick if available
  const handlePriceUpdate = useCallback((data: WSPriceUpdate) => {
    const tick = (data.payload as { tick?: number })?.tick;
    if (typeof tick === 'number' && tick > 0) {
      setLastKnownTick((prev) => (tick > prev ? tick : prev));
    }
    handlersRef.current.onPriceUpdate?.(data);
  }, []);

  const {
    status: connectionStatus,
    isConnected,
    isAuthenticated,
    agentId,
    reconnectAttempt,
    latency,
    connect,
    disconnect,
    authenticate,
    subscribe,
    unsubscribe,
  } = useWebSocket(
    {
      ...handlers,
      onTickUpdate: handleTickUpdate,
      onTrade: handleTrade,
      onNews: handleNews,
      onPriceUpdate: handlePriceUpdate,
      onConnect: () => {
        handlersRef.current.onConnect?.();
      },
      onDisconnect: (reason) => {
        handlersRef.current.onDisconnect?.(reason);
      },
      onAuthSuccess: (data) => {
        handlersRef.current.onAuthSuccess?.(data);
      },
    },
    { ...wsOptions, apiKey }
  );

  // Handler for replaying tick events from recovery
  const handleReplayTickEvent = useCallback((event: TickEventRecord) => {
    // Update last known tick from replayed events
    if (event.tick > 0) {
      setLastKnownTick((prev) => (event.tick > prev ? event.tick : prev));
    }

    // Call the user's handler
    onTickEvent?.(event);

    // Replay individual events through handlers if the user has registered them
    // Note: sequence numbers are synthesized for recovered events since they weren't transmitted via WebSocket
    if (event.trades.length > 0 && handlersRef.current.onTrade) {
      for (const trade of event.trades) {
        handlersRef.current.onTrade({
          type: 'TRADE',
          payload: {
            ...trade,
            tick: event.tick,
            timestamp: event.timestamp,
            buyerOrderId: '',
            sellerOrderId: '',
            createdAt: new Date(event.timestamp),
          },
          timestamp: event.timestamp,
          sequence: 0, // Recovered events don't have real sequence numbers
        } as WSTrade);
      }
    }

    if (event.news.length > 0 && handlersRef.current.onNews) {
      for (const article of event.news) {
        handlersRef.current.onNews({
          type: 'NEWS',
          payload: {
            ...article,
            tick: event.tick,
            timestamp: event.timestamp,
            content: '',
            source: 'recovery',
            agentIds: [],
            createdAt: new Date(event.timestamp),
          },
          timestamp: event.timestamp,
          sequence: 0, // Recovered events don't have real sequence numbers
        } as WSNews);
      }
    }

    if (event.priceUpdates.length > 0 && handlersRef.current.onPriceUpdate) {
      handlersRef.current.onPriceUpdate({
        type: 'PRICE_UPDATE',
        payload: {
          tick: event.tick,
          timestamp: event.timestamp,
          prices: event.priceUpdates.map((p) => ({
            symbol: p.symbol,
            price: p.newPrice,
            change: p.change,
            changePercent: p.changePercent,
            volume: p.volume,
          })),
        },
        timestamp: event.timestamp,
        sequence: 0, // Recovered events don't have real sequence numbers
      } as WSPriceUpdate);
    }
  }, [onTickEvent]);

  const {
    recoveryStatus,
    recoveredEventCount,
    isRecovering,
    error: recoveryError,
    recover,
    reset: resetRecovery,
  } = useEventReplay({
    apiKey,
    agentId: agentId || '',
    apiUrl: wsOptions.url?.replace('ws:', 'http:').replace('wss:', 'https:'),
    onWorldState,
    onPortfolio,
    onTickEvent: handleReplayTickEvent,
    onRecoveryStart,
    onRecoveryComplete,
    onRecoveryError,
  });

  // Track if this is a reconnection (had a tick before current disconnect)
  const lastKnownTickBeforeDisconnectRef = useRef(0);

  // Trigger recovery when reconnecting after being previously connected
  useEffect(() => {
    if (isConnected && isAuthenticated && agentId) {
      // Check if we have a tick from before disconnect (indicating reconnection)
      if (wasConnectedRef.current && lastKnownTickBeforeDisconnectRef.current > 0) {
        recover();
      }
      wasConnectedRef.current = true;
    }
  }, [isConnected, isAuthenticated, agentId, recover]);

  // Store the last known tick before disconnect for recovery
  useEffect(() => {
    if (!isConnected && lastKnownTick > 0) {
      lastKnownTickBeforeDisconnectRef.current = lastKnownTick;
    }
  }, [isConnected, lastKnownTick]);

  const handleDisconnect = useCallback(() => {
    resetRecovery();
    disconnect();
    wasConnectedRef.current = false;
    lastKnownTickBeforeDisconnectRef.current = 0;
    setLastKnownTick(0);
  }, [disconnect, resetRecovery]);

  return useMemo(
    () => ({
      connectionStatus,
      recoveryStatus,
      isConnected,
      isAuthenticated,
      isRecovering,
      agentId,
      lastKnownTick,
      recoveredEventCount,
      reconnectAttempt,
      latency,
      error: recoveryError,
      connect,
      disconnect: handleDisconnect,
      subscribe,
      unsubscribe,
    }),
    [
      connectionStatus,
      recoveryStatus,
      isConnected,
      isAuthenticated,
      isRecovering,
      agentId,
      lastKnownTick,
      recoveredEventCount,
      reconnectAttempt,
      latency,
      recoveryError,
      connect,
      handleDisconnect,
      subscribe,
      unsubscribe,
    ]
  );
}
