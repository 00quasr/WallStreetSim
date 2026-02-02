import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useInvestigations } from './useInvestigations';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockMostWantedResponse(entries: Array<{
  id?: string;
  agentId?: string;
  agentName?: string;
  crimeType?: string;
  status?: string;
  tickOpened?: number;
  tickCharged?: number | null;
  fineAmount?: number | null;
}> = []) {
  return {
    success: true,
    data: entries.map((entry, i) => ({
      id: entry.id || `inv-${i}`,
      agentId: entry.agentId || `agent-${i}`,
      agentName: entry.agentName || `Agent${i}`,
      crimeType: entry.crimeType || 'insider_trading',
      status: entry.status || 'charged',
      tickOpened: entry.tickOpened || 10000 + i * 100,
      tickCharged: entry.tickCharged ?? 10500 + i * 100,
      fineAmount: entry.fineAmount ?? 1000000,
      createdAt: new Date().toISOString(),
    })),
  };
}

function createMockPrisonResponse(prisoners: Array<{
  agentId?: string;
  agentName?: string;
  imprisonedUntilTick?: number | null;
  crimeType?: string | null;
  sentenceYears?: number | null;
  fineAmount?: number | null;
}> = [], totalCount?: number) {
  return {
    success: true,
    data: {
      prisoners: prisoners.map((p, i) => ({
        agentId: p.agentId || `agent-${i}`,
        agentName: p.agentName || `Prisoner${i}`,
        imprisonedUntilTick: p.imprisonedUntilTick ?? 160000,
        crimeType: p.crimeType ?? 'accounting_fraud',
        sentenceYears: p.sentenceYears ?? 10,
        fineAmount: p.fineAmount ?? 1000000,
      })),
      totalCount: totalCount ?? prisoners.length,
    },
  };
}

describe('useInvestigations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization and fetching', () => {
    it('should initialize with loading state', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.mostWanted).toEqual([]);
      expect(result.current.prison.prisoners).toEqual([]);
      expect(result.current.error).toBeNull();

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should fetch most wanted and prison data on mount', async () => {
      const mockMostWanted = [
        { agentName: 'ShadowTrader', crimeType: 'insider_trading' },
        { agentName: 'PumpKing', crimeType: 'market_manipulation' },
      ];
      const mockPrisoners = [
        { agentName: 'BernieBot', sentenceYears: 150 },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse(mockMostWanted)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse(mockPrisoners, 23)),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mostWanted).toHaveLength(2);
      expect(result.current.mostWanted[0].agentName).toBe('ShadowTrader');
      expect(result.current.mostWanted[0].crimeType).toBe('insider_trading');
      expect(result.current.mostWanted[1].agentName).toBe('PumpKing');

      expect(result.current.prison.prisoners).toHaveLength(1);
      expect(result.current.prison.prisoners[0].agentName).toBe('BernieBot');
      expect(result.current.prison.prisoners[0].sentenceYears).toBe(150);
      expect(result.current.prison.totalCount).toBe(23);
    });

    it('should use correct API URL', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      renderHook(() => useInvestigations({ apiUrl: 'http://custom-api:9000', refreshInterval: 0 }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://custom-api:9000/world/investigations/most-wanted')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://custom-api:9000/world/prison')
      );
    });

    it('should pass limit parameters', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      renderHook(() => useInvestigations({
        mostWantedLimit: 5,
        prisonLimit: 3,
        refreshInterval: 0,
      }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=5')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=3')
      );
    });
  });

  describe('error handling', () => {
    it('should handle most wanted fetch errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toContain('500');
    });

    it('should handle prison fetch errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse()),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toContain('404');
    });

    it('should handle API error response for most wanted', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false, error: 'Database connection failed' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Database connection failed');
    });

    it('should handle API error response for prison', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false, error: 'Service unavailable' }),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Service unavailable');
    });
  });

  describe('refetch function', () => {
    it('should allow manual refetch', async () => {
      const initialMostWanted = [{ agentName: 'Agent1' }];
      const updatedMostWanted = [{ agentName: 'Agent1' }, { agentName: 'Agent2' }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse(initialMostWanted)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse([], 0)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse(updatedMostWanted)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse([], 5)),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mostWanted).toHaveLength(1);
      expect(result.current.prison.totalCount).toBe(0);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.mostWanted).toHaveLength(2);
      expect(result.current.prison.totalCount).toBe(5);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should set loading state during refetch', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse()),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        })
        .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() =>
          resolve({
            ok: true,
            json: () => Promise.resolve(createMockMostWantedResponse()),
          }), 100
        )))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.refetch();
      });

      expect(result.current.isLoading).toBe(true);
    });
  });


  describe('date parsing', () => {
    it('should parse createdAt as Date object', async () => {
      const testDate = '2024-06-15T12:00:00.000Z';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: [{
              id: 'inv-1',
              agentId: 'agent-1',
              agentName: 'TestAgent',
              crimeType: 'bribery',
              status: 'open',
              tickOpened: 10000,
              tickCharged: null,
              fineAmount: null,
              createdAt: testDate,
            }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse()),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mostWanted[0].createdAt).toBeInstanceOf(Date);
      expect(result.current.mostWanted[0].createdAt.toISOString()).toBe(testDate);
    });
  });

  describe('empty states', () => {
    it('should handle empty most wanted list', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse([])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse([{ agentName: 'Prisoner1' }], 1)),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mostWanted).toHaveLength(0);
      expect(result.current.prison.prisoners).toHaveLength(1);
    });

    it('should handle empty prison list', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockMostWantedResponse([{ agentName: 'Wanted1' }])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockPrisonResponse([], 0)),
        });

      const { result } = renderHook(() => useInvestigations({ refreshInterval: 0 }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.mostWanted).toHaveLength(1);
      expect(result.current.prison.prisoners).toHaveLength(0);
      expect(result.current.prison.totalCount).toBe(0);
    });
  });
});
