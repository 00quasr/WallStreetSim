import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLeaderboard } from './useLeaderboard';
import type {
  WSLeaderboardUpdate,
  LeaderboardEntry,
  AgentRole,
  AgentStatus,
} from '@wallstreetsim/types';

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

function createMockLeaderboardEntry(
  rank: number,
  overrides?: Partial<LeaderboardEntry>
): LeaderboardEntry {
  return {
    rank,
    agentId: `agent-${rank}`,
    name: `Agent${rank}`,
    role: 'hedge_fund_manager',
    netWorth: 1000000000 - rank * 100000000,
    change24h: 5.0 - rank,
    status: 'active',
    ...overrides,
  };
}

function createMockLeaderboardUpdate(
  entries: LeaderboardEntry[],
  timestamp?: Date
): WSLeaderboardUpdate {
  return {
    type: 'LEADERBOARD_UPDATE',
    timestamp: new Date().toISOString(),
    payload: {
      timestamp: timestamp || new Date(),
      entries,
    },
  };
}

describe('useLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(eventHandlers).forEach((key) => delete eventHandlers[key]);
    mockSocket.connected = false;
    mockSocket.id = 'test-socket-id';
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      expect(result.current.entries).toEqual([]);
      expect(result.current.topAgents).toEqual([]);
      expect(result.current.lastUpdate).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should auto-connect by default', () => {
      renderHook(() => useLeaderboard());

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should not auto-connect when autoConnect is false', () => {
      renderHook(() => useLeaderboard({ autoConnect: false }));

      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('should auto-subscribe to leaderboard channel on connect', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      // Connect first
      act(() => {
        result.current.connect();
      });

      // Then simulate successful connection
      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', { channels: ['leaderboard'] });
    });
  });

  describe('leaderboard handling', () => {
    it('should handle LEADERBOARD_UPDATE events', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { name: 'AlphaWolf', netWorth: 4200000000 }),
        createMockLeaderboardEntry(2, { name: 'QuantumMind', netWorth: 2800000000 }),
        createMockLeaderboardEntry(3, { name: 'DiamondHands', netWorth: 1100000000 }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(3);
      expect(result.current.entries[0].name).toBe('AlphaWolf');
      expect(result.current.entries[0].netWorth).toBe(4200000000);
    });

    it('should call onUpdate callback', () => {
      const onUpdate = vi.fn();
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false, onUpdate }));

      act(() => {
        result.current.connect();
      });

      const entries = [createMockLeaderboardEntry(1)];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(onUpdate).toHaveBeenCalledWith(entries);
    });

    it('should update lastUpdate timestamp', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const timestamp = new Date('2024-01-15T12:00:00Z');
      const entries = [createMockLeaderboardEntry(1)];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries, timestamp));
      });

      expect(result.current.lastUpdate).toEqual(timestamp);
    });

    it('should limit entries to maxEntries', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false, maxEntries: 3 }));

      act(() => {
        result.current.connect();
      });

      const entries = Array.from({ length: 10 }, (_, i) => createMockLeaderboardEntry(i + 1));

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(3);
      expect(result.current.entries[0].rank).toBe(1);
      expect(result.current.entries[2].rank).toBe(3);
    });

    it('should compute topAgents correctly', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = Array.from({ length: 15 }, (_, i) => createMockLeaderboardEntry(i + 1));

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.topAgents).toHaveLength(10);
      expect(result.current.topAgents[0].rank).toBe(1);
      expect(result.current.topAgents[9].rank).toBe(10);
    });
  });

  describe('filtering by role', () => {
    it('should filter entries by roles', () => {
      const { result } = renderHook(() =>
        useLeaderboard({ autoConnect: false, roles: ['hedge_fund_manager', 'quant'] })
      );

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { role: 'hedge_fund_manager' }),
        createMockLeaderboardEntry(2, { role: 'retail_trader' }),
        createMockLeaderboardEntry(3, { role: 'quant' }),
        createMockLeaderboardEntry(4, { role: 'ceo' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries.map((e) => e.role)).toEqual(['hedge_fund_manager', 'quant']);
    });

    it('should accept all roles when no filter is specified', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { role: 'hedge_fund_manager' }),
        createMockLeaderboardEntry(2, { role: 'retail_trader' }),
        createMockLeaderboardEntry(3, { role: 'quant' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(3);
    });
  });

  describe('filtering by active status', () => {
    it('should filter for active agents only when onlyActive is true', () => {
      const { result } = renderHook(() =>
        useLeaderboard({ autoConnect: false, onlyActive: true })
      );

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { status: 'active' }),
        createMockLeaderboardEntry(2, { status: 'bankrupt' }),
        createMockLeaderboardEntry(3, { status: 'active' }),
        createMockLeaderboardEntry(4, { status: 'imprisoned' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries.every((e) => e.status === 'active')).toBe(true);
    });

    it('should accept all statuses when onlyActive is false', () => {
      const { result } = renderHook(() =>
        useLeaderboard({ autoConnect: false, onlyActive: false })
      );

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { status: 'active' }),
        createMockLeaderboardEntry(2, { status: 'bankrupt' }),
        createMockLeaderboardEntry(3, { status: 'imprisoned' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(3);
    });
  });

  describe('getAgentByRank', () => {
    it('should return agent by rank', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { name: 'First' }),
        createMockLeaderboardEntry(2, { name: 'Second' }),
        createMockLeaderboardEntry(3, { name: 'Third' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const agent = result.current.getAgentByRank(2);

      expect(agent).toBeDefined();
      expect(agent?.name).toBe('Second');
    });

    it('should return undefined for non-existent rank', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [createMockLeaderboardEntry(1)];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const agent = result.current.getAgentByRank(999);

      expect(agent).toBeUndefined();
    });
  });

  describe('getAgentById', () => {
    it('should return agent by id', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { agentId: 'abc-123', name: 'TargetAgent' }),
        createMockLeaderboardEntry(2, { agentId: 'def-456' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const agent = result.current.getAgentById('abc-123');

      expect(agent).toBeDefined();
      expect(agent?.name).toBe('TargetAgent');
    });

    it('should return undefined for non-existent id', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [createMockLeaderboardEntry(1)];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const agent = result.current.getAgentById('non-existent');

      expect(agent).toBeUndefined();
    });
  });

  describe('getAgentsByRole', () => {
    it('should return agents filtered by role', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { role: 'hedge_fund_manager' }),
        createMockLeaderboardEntry(2, { role: 'retail_trader' }),
        createMockLeaderboardEntry(3, { role: 'hedge_fund_manager' }),
        createMockLeaderboardEntry(4, { role: 'quant' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const hedgeFundManagers = result.current.getAgentsByRole('hedge_fund_manager');

      expect(hedgeFundManagers).toHaveLength(2);
      expect(hedgeFundManagers.map((a) => a.rank)).toEqual([1, 3]);
    });

    it('should return empty array for non-matching role', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [createMockLeaderboardEntry(1, { role: 'hedge_fund_manager' })];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const ceos = result.current.getAgentsByRole('ceo');

      expect(ceos).toEqual([]);
    });
  });

  describe('getAgentsByStatus', () => {
    it('should return agents filtered by status', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [
        createMockLeaderboardEntry(1, { status: 'active' }),
        createMockLeaderboardEntry(2, { status: 'bankrupt' }),
        createMockLeaderboardEntry(3, { status: 'active' }),
        createMockLeaderboardEntry(4, { status: 'imprisoned' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const activeAgents = result.current.getAgentsByStatus('active');

      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.map((a) => a.rank)).toEqual([1, 3]);
    });

    it('should return empty array for non-matching status', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      act(() => {
        result.current.connect();
      });

      const entries = [createMockLeaderboardEntry(1, { status: 'active' })];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      const fledAgents = result.current.getAgentsByStatus('fled');

      expect(fledAgents).toEqual([]);
    });
  });

  describe('connection management', () => {
    it('should expose connect function', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      expect(typeof result.current.connect).toBe('function');

      act(() => {
        result.current.connect();
      });

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should expose disconnect function', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

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
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      expect(typeof result.current.subscribe).toBe('function');

      act(() => {
        result.current.connect();
      });

      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      act(() => {
        result.current.subscribe(['leaderboard']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('SUBSCRIBE', { channels: ['leaderboard'] });
    });

    it('should expose unsubscribe function', () => {
      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

      expect(typeof result.current.unsubscribe).toBe('function');

      act(() => {
        result.current.connect();
      });

      mockSocket.connected = true;
      act(() => {
        triggerEvent('connect');
      });

      act(() => {
        result.current.unsubscribe(['leaderboard']);
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('UNSUBSCRIBE', { channels: ['leaderboard'] });
    });

    it('should update isConnected when connected', () => {
      mockSocket.connected = true;

      const { result } = renderHook(() => useLeaderboard({ autoConnect: false }));

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

  describe('options passthrough', () => {
    it('should pass WebSocket options to useWebSocket', () => {
      renderHook(() =>
        useLeaderboard({
          url: 'ws://custom-server:9000',
          apiKey: 'test-api-key',
          autoConnect: true,
        })
      );

      expect(mockSocket.connect).toHaveBeenCalled();
      expect(mockSocket.once).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('combined filters', () => {
    it('should apply multiple filters together', () => {
      const { result } = renderHook(() =>
        useLeaderboard({
          autoConnect: false,
          roles: ['hedge_fund_manager', 'quant'],
          onlyActive: true,
        })
      );

      act(() => {
        result.current.connect();
      });

      const entries = [
        // Passes all filters
        createMockLeaderboardEntry(1, { role: 'hedge_fund_manager', status: 'active' }),
        // Wrong role
        createMockLeaderboardEntry(2, { role: 'retail_trader', status: 'active' }),
        // Not active
        createMockLeaderboardEntry(3, { role: 'hedge_fund_manager', status: 'bankrupt' }),
        // Passes all filters
        createMockLeaderboardEntry(4, { role: 'quant', status: 'active' }),
        // Wrong role and not active
        createMockLeaderboardEntry(5, { role: 'ceo', status: 'imprisoned' }),
      ];

      act(() => {
        triggerEvent('LEADERBOARD_UPDATE', createMockLeaderboardUpdate(entries));
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries.map((e) => e.rank)).toEqual([1, 4]);
    });
  });
});
