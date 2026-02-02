'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MarketRegime } from '@wallstreetsim/types';

export interface WorldStatus {
  tick: number;
  marketOpen: boolean;
  regime: MarketRegime;
  interestRate: number;
  inflationRate: number;
  gdpGrowth: number;
  lastTickAt: string | null;
  agents: {
    total: number;
    active: number;
    bankrupt: number;
    imprisoned: number;
    fled: number;
  };
  market: {
    totalMarketCap: number;
    companyCount: number;
  };
}

export interface UseWorldStatusOptions {
  pollIntervalMs?: number;
  enabled?: boolean;
}

export interface UseWorldStatusReturn {
  worldStatus: WorldStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 5000;

export function useWorldStatus(options: UseWorldStatusOptions = {}): UseWorldStatusReturn {
  const { pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, enabled = true } = options;

  const [worldStatus, setWorldStatus] = useState<WorldStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchWorldStatus = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/world/status`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch world status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.data) {
        setWorldStatus(data.data);
        setError(null);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    fetchWorldStatus();

    const intervalId = setInterval(fetchWorldStatus, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, pollIntervalMs, fetchWorldStatus]);

  return {
    worldStatus,
    isLoading,
    error,
    refetch: fetchWorldStatus,
  };
}
