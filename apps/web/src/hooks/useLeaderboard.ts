'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useWebSocket, type UseWebSocketOptions } from './useWebSocket';
import type {
  WSLeaderboardUpdate,
  LeaderboardEntry,
  AgentRole,
  AgentStatus,
} from '@wallstreetsim/types';

export interface LeaderboardState {
  entries: LeaderboardEntry[];
  lastUpdate: Date | null;
}

export interface UseLeaderboardOptions extends UseWebSocketOptions {
  maxEntries?: number;
  roles?: AgentRole[];
  onlyActive?: boolean;
  onUpdate?: (entries: LeaderboardEntry[]) => void;
}

export interface UseLeaderboardReturn {
  entries: LeaderboardEntry[];
  topAgents: LeaderboardEntry[];
  lastUpdate: Date | null;
  getAgentByRank: (rank: number) => LeaderboardEntry | undefined;
  getAgentById: (agentId: string) => LeaderboardEntry | undefined;
  getAgentsByRole: (role: AgentRole) => LeaderboardEntry[];
  getAgentsByStatus: (status: AgentStatus) => LeaderboardEntry[];
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  connect: () => void;
  disconnect: () => void;
  subscribe: (channels: string[]) => void;
  unsubscribe: (channels: string[]) => void;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TOP_AGENTS_COUNT = 10;

const INITIAL_STATE: LeaderboardState = {
  entries: [],
  lastUpdate: null,
};

export function useLeaderboard(options: UseLeaderboardOptions = {}): UseLeaderboardReturn {
  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    roles,
    onlyActive = false,
    onUpdate,
    ...wsOptions
  } = options;

  const [state, setState] = useState<LeaderboardState>(INITIAL_STATE);
  const onUpdateRef = useRef(onUpdate);

  // Keep ref up to date
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const handleLeaderboardUpdate = useCallback(
    (message: WSLeaderboardUpdate) => {
      let entries = message.payload.entries;

      // Filter by roles if specified
      if (roles && roles.length > 0) {
        entries = entries.filter((entry) => roles.includes(entry.role));
      }

      // Filter by active status if specified
      if (onlyActive) {
        entries = entries.filter((entry) => entry.status === 'active');
      }

      // Limit entries
      entries = entries.slice(0, maxEntries);

      setState({
        entries,
        lastUpdate: new Date(message.payload.timestamp),
      });

      onUpdateRef.current?.(entries);
    },
    [roles, onlyActive, maxEntries]
  );

  // Store subscribe function in ref to avoid re-creating handleConnect
  const subscribeRef = useRef<(channels: string[]) => void>(() => {});

  // Auto-subscribe to leaderboard channel on connect
  const handleConnect = useCallback(() => {
    subscribeRef.current(['leaderboard']);
  }, []);

  const {
    status,
    isConnected,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
  } = useWebSocket(
    {
      onLeaderboardUpdate: handleLeaderboardUpdate,
      onConnect: handleConnect,
    },
    wsOptions
  );

  // Update subscribe ref when subscribe function changes
  subscribeRef.current = subscribe;

  const getAgentByRank = useCallback(
    (rank: number): LeaderboardEntry | undefined => {
      return state.entries.find((entry) => entry.rank === rank);
    },
    [state.entries]
  );

  const getAgentById = useCallback(
    (agentId: string): LeaderboardEntry | undefined => {
      return state.entries.find((entry) => entry.agentId === agentId);
    },
    [state.entries]
  );

  const getAgentsByRole = useCallback(
    (role: AgentRole): LeaderboardEntry[] => {
      return state.entries.filter((entry) => entry.role === role);
    },
    [state.entries]
  );

  const getAgentsByStatus = useCallback(
    (agentStatus: AgentStatus): LeaderboardEntry[] => {
      return state.entries.filter((entry) => entry.status === agentStatus);
    },
    [state.entries]
  );

  const topAgents = useMemo(
    () => state.entries.slice(0, DEFAULT_TOP_AGENTS_COUNT),
    [state.entries]
  );

  return useMemo(
    () => ({
      entries: state.entries,
      topAgents,
      lastUpdate: state.lastUpdate,
      getAgentByRank,
      getAgentById,
      getAgentsByRole,
      getAgentsByStatus,
      isConnected,
      connectionStatus: status,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
    }),
    [
      state.entries,
      topAgents,
      state.lastUpdate,
      getAgentByRank,
      getAgentById,
      getAgentsByRole,
      getAgentsByStatus,
      isConnected,
      status,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
    ]
  );
}
