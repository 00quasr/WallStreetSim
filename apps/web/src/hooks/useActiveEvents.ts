'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTickContext } from '@/context/TickContext';
import type { MarketEvent } from '@wallstreetsim/types';

export interface ActiveEvent extends MarketEvent {
  /** Remaining ticks until the event expires */
  remainingDuration: number;
}

export interface UseActiveEventsReturn {
  /** Active events with remaining duration > 0 */
  activeEvents: ActiveEvent[];
  /** All events including expired ones from current session */
  allEvents: MarketEvent[];
  /** Clear all tracked events */
  clearEvents: () => void;
}

/**
 * Hook that tracks active market events across ticks.
 * Events are considered active until their duration expires.
 * New events from each tick are added to the tracking list,
 * and existing events have their remaining duration decremented.
 */
export function useActiveEvents(): UseActiveEventsReturn {
  const { events: tickEvents, currentTick } = useTickContext();
  const [trackedEvents, setTrackedEvents] = useState<Map<string, ActiveEvent>>(new Map());
  const [lastProcessedTick, setLastProcessedTick] = useState<number>(-1);

  // Process incoming events and update durations
  useEffect(() => {
    if (currentTick === lastProcessedTick) {
      return;
    }

    setTrackedEvents((prev) => {
      const updated = new Map(prev);

      // Track which events are newly added (so we don't decrement them)
      const newEventIds = new Set<string>();

      // Add new events from this tick
      for (const event of tickEvents) {
        if (!updated.has(event.id)) {
          updated.set(event.id, {
            ...event,
            remainingDuration: event.duration,
          });
          newEventIds.add(event.id);
        }
      }

      // Decrement duration for existing tracked events (if tick advanced)
      // Skip newly added events - they start with full duration
      if (currentTick > lastProcessedTick && lastProcessedTick >= 0) {
        const ticksElapsed = currentTick - lastProcessedTick;
        const entries = Array.from(updated.entries());
        for (const [id, event] of entries) {
          // Don't decrement newly added events
          if (newEventIds.has(id)) {
            continue;
          }
          const newDuration = Math.max(0, event.remainingDuration - ticksElapsed);
          if (newDuration <= 0) {
            // Remove expired events
            updated.delete(id);
          } else {
            updated.set(id, {
              ...event,
              remainingDuration: newDuration,
            });
          }
        }
      }

      return updated;
    });

    setLastProcessedTick(currentTick);
  }, [tickEvents, currentTick, lastProcessedTick]);

  const clearEvents = useCallback(() => {
    setTrackedEvents(new Map());
  }, []);

  const activeEvents = useMemo(() => {
    return Array.from(trackedEvents.values())
      .filter((e) => e.remainingDuration > 0)
      .sort((a, b) => b.tick - a.tick); // Most recent first
  }, [trackedEvents]);

  const allEvents = useMemo(() => {
    return Array.from(trackedEvents.values()).sort((a, b) => b.tick - a.tick);
  }, [trackedEvents]);

  return {
    activeEvents,
    allEvents,
    clearEvents,
  };
}
