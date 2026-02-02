'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { CrimeType, InvestigationStatus } from '@wallstreetsim/types';

export interface MostWantedEntry {
  id: string;
  agentId: string;
  agentName: string;
  crimeType: CrimeType;
  status: InvestigationStatus;
  tickOpened: number;
  tickCharged: number | null;
  fineAmount: number | null;
  createdAt: Date;
}

export interface PrisonEntry {
  agentId: string;
  agentName: string;
  imprisonedUntilTick: number | null;
  crimeType: CrimeType | null;
  sentenceYears: number | null;
  fineAmount: number | null;
}

export interface PrisonData {
  prisoners: PrisonEntry[];
  totalCount: number;
}

export interface UseInvestigationsOptions {
  apiUrl?: string;
  refreshInterval?: number;
  mostWantedLimit?: number;
  prisonLimit?: number;
}

export interface UseInvestigationsReturn {
  mostWanted: MostWantedEntry[];
  prison: PrisonData;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DEFAULT_REFRESH_INTERVAL = 10000; // 10 seconds
const DEFAULT_MOST_WANTED_LIMIT = 10;
const DEFAULT_PRISON_LIMIT = 10;

export function useInvestigations(options: UseInvestigationsOptions = {}): UseInvestigationsReturn {
  const {
    apiUrl,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
    mostWantedLimit = DEFAULT_MOST_WANTED_LIMIT,
    prisonLimit = DEFAULT_PRISON_LIMIT,
  } = options;

  const [mostWanted, setMostWanted] = useState<MostWantedEntry[]>([]);
  const [prison, setPrison] = useState<PrisonData>({ prisoners: [], totalCount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const baseUrl = useMemo(() => {
    if (apiUrl) return apiUrl;
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.hostname}:8080`;
    }
    return 'http://localhost:8080';
  }, [apiUrl]);

  const fetchData = useCallback(async () => {
    try {
      const [mostWantedRes, prisonRes] = await Promise.all([
        fetch(`${baseUrl}/world/investigations/most-wanted?limit=${mostWantedLimit}`),
        fetch(`${baseUrl}/world/prison?limit=${prisonLimit}`),
      ]);

      if (!mostWantedRes.ok) {
        throw new Error(`Failed to fetch most wanted: ${mostWantedRes.status}`);
      }
      if (!prisonRes.ok) {
        throw new Error(`Failed to fetch prison data: ${prisonRes.status}`);
      }

      const [mostWantedJson, prisonJson] = await Promise.all([
        mostWantedRes.json(),
        prisonRes.json(),
      ]);

      if (!mostWantedJson.success) {
        throw new Error(mostWantedJson.error || 'Failed to fetch most wanted');
      }
      if (!prisonJson.success) {
        throw new Error(prisonJson.error || 'Failed to fetch prison data');
      }

      setMostWanted(
        mostWantedJson.data.map((entry: MostWantedEntry) => ({
          ...entry,
          createdAt: new Date(entry.createdAt),
        }))
      );

      setPrison(prisonJson.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, mostWantedLimit, prisonLimit]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    fetchData();

    if (refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [fetchData, refreshInterval]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    await fetchData();
  }, [fetchData]);

  return useMemo(
    () => ({
      mostWanted,
      prison,
      isLoading,
      error,
      refetch,
    }),
    [mostWanted, prison, isLoading, error, refetch]
  );
}
