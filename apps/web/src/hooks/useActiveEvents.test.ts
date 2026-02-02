import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveEvents } from './useActiveEvents';
import type { MarketEvent } from '@wallstreetsim/types';

// Mock useTickContext
const mockUseTickContext = vi.fn();
vi.mock('@/context/TickContext', () => ({
  useTickContext: () => mockUseTickContext(),
}));

function createMockEvent(
  id: string,
  type: string,
  overrides?: Partial<MarketEvent>
): MarketEvent {
  return {
    id,
    type: type as MarketEvent['type'],
    impact: 0.05,
    duration: 10,
    tick: 100,
    headline: `Event ${id}`,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockTickContext(
  currentTick: number,
  events: MarketEvent[] = []
) {
  return {
    currentTick,
    timestamp: new Date(),
    marketOpen: true,
    regime: 'normal' as const,
    priceUpdates: [],
    trades: [],
    events,
    news: [],
    isConnected: true,
    connectionStatus: 'connected' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe('useActiveEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTickContext.mockReturnValue(createMockTickContext(0, []));
  });

  describe('initialization', () => {
    it('should start with empty active events', () => {
      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toEqual([]);
      expect(result.current.allEvents).toEqual([]);
    });
  });

  describe('adding events', () => {
    it('should add new events from tick context', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toHaveLength(1);
      expect(result.current.activeEvents[0].id).toBe('event-1');
      expect(result.current.activeEvents[0].remainingDuration).toBe(10);
    });

    it('should not duplicate events with same id', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toHaveLength(1);

      // Simulate same event arriving again on next tick
      mockUseTickContext.mockReturnValue(createMockTickContext(101, [event]));
      rerender();

      expect(result.current.activeEvents).toHaveLength(1);
      expect(result.current.activeEvents[0].id).toBe('event-1');
    });

    it('should add multiple events from same tick', () => {
      const events = [
        createMockEvent('event-1', 'EARNINGS_BEAT', { tick: 100, duration: 10 }),
        createMockEvent('event-2', 'CEO_SCANDAL', { tick: 100, duration: 5 }),
      ];
      mockUseTickContext.mockReturnValue(createMockTickContext(100, events));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toHaveLength(2);
    });
  });

  describe('duration tracking', () => {
    it('should decrement remaining duration each tick', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].remainingDuration).toBe(10);

      // Advance by 1 tick
      mockUseTickContext.mockReturnValue(createMockTickContext(101, []));
      rerender();

      expect(result.current.activeEvents[0].remainingDuration).toBe(9);
    });

    it('should decrement by multiple ticks if ticks skip', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].remainingDuration).toBe(10);

      // Advance by 5 ticks
      mockUseTickContext.mockReturnValue(createMockTickContext(105, []));
      rerender();

      expect(result.current.activeEvents[0].remainingDuration).toBe(5);
    });

    it('should remove events when duration reaches 0', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 3,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toHaveLength(1);

      // Advance by 3 ticks to expire the event
      mockUseTickContext.mockReturnValue(createMockTickContext(103, []));
      rerender();

      expect(result.current.activeEvents).toHaveLength(0);
    });

    it('should handle events with duration 0 (instant events)', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 0,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      // Instant events should show with remainingDuration 0
      expect(result.current.activeEvents).toHaveLength(0);

      // After tick advances, it should be gone
      mockUseTickContext.mockReturnValue(createMockTickContext(101, []));
      rerender();

      expect(result.current.activeEvents).toHaveLength(0);
    });
  });

  describe('sorting', () => {
    it('should sort events by tick (most recent first)', () => {
      const events = [
        createMockEvent('event-old', 'EARNINGS_BEAT', { tick: 90, duration: 20 }),
        createMockEvent('event-new', 'CEO_SCANDAL', { tick: 100, duration: 10 }),
      ];
      mockUseTickContext.mockReturnValue(createMockTickContext(100, events));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].id).toBe('event-new');
      expect(result.current.activeEvents[1].id).toBe('event-old');
    });
  });

  describe('clearEvents', () => {
    it('should clear all tracked events', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toHaveLength(1);

      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.activeEvents).toHaveLength(0);
      expect(result.current.allEvents).toHaveLength(0);
    });
  });

  describe('event types', () => {
    it('should track positive impact events', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
        impact: 0.05,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].impact).toBeGreaterThan(0);
    });

    it('should track negative impact events', () => {
      const event = createMockEvent('event-1', 'CEO_SCANDAL', {
        tick: 100,
        duration: 10,
        impact: -0.1,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].impact).toBeLessThan(0);
    });

    it('should track events with symbol', () => {
      const event = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
        symbol: 'APEX',
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].symbol).toBe('APEX');
    });

    it('should track sector-wide events', () => {
      const event = createMockEvent('event-1', 'SECTOR_ROTATION', {
        tick: 100,
        duration: 10,
        sector: 'Technology',
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event]));

      const { result } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents[0].sector).toBe('Technology');
    });
  });

  describe('accumulation across ticks', () => {
    it('should accumulate events from multiple ticks', () => {
      // First tick with event 1
      const event1 = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event1]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      expect(result.current.activeEvents).toHaveLength(1);

      // Second tick with event 2
      const event2 = createMockEvent('event-2', 'CEO_SCANDAL', {
        tick: 101,
        duration: 5,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(101, [event2]));
      rerender();

      expect(result.current.activeEvents).toHaveLength(2);
      // Should have both events with adjusted durations
      const event1Active = result.current.activeEvents.find(e => e.id === 'event-1');
      const event2Active = result.current.activeEvents.find(e => e.id === 'event-2');
      expect(event1Active?.remainingDuration).toBe(9); // Decremented by 1
      expect(event2Active?.remainingDuration).toBe(5); // Just added, starts with full duration
    });

    it('should expire older events while keeping newer ones', () => {
      // First tick with short-lived event
      const event1 = createMockEvent('event-1', 'EARNINGS_BEAT', {
        tick: 100,
        duration: 2,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(100, [event1]));

      const { result, rerender } = renderHook(() => useActiveEvents());

      // Second tick with longer-lived event
      const event2 = createMockEvent('event-2', 'CEO_SCANDAL', {
        tick: 101,
        duration: 10,
      });
      mockUseTickContext.mockReturnValue(createMockTickContext(101, [event2]));
      rerender();

      expect(result.current.activeEvents).toHaveLength(2);

      // Third tick - event1 should expire (duration was 2, now 2 ticks passed)
      mockUseTickContext.mockReturnValue(createMockTickContext(102, []));
      rerender();

      expect(result.current.activeEvents).toHaveLength(1);
      expect(result.current.activeEvents[0].id).toBe('event-2');
    });
  });
});
