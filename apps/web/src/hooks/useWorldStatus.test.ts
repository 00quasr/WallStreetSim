import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useWorldStatus } from './useWorldStatus';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockWorldStatusResponse(overrides?: Partial<{
  tick: number;
  marketOpen: boolean;
  regime: string;
  interestRate: number;
  inflationRate: number;
  gdpGrowth: number;
}>) {
  return {
    success: true,
    data: {
      tick: 1000,
      marketOpen: true,
      regime: 'normal',
      interestRate: 0.05,
      inflationRate: 0.02,
      gdpGrowth: 0.03,
      lastTickAt: '2025-01-01T00:00:00Z',
      agents: {
        total: 100,
        active: 80,
        bankrupt: 10,
        imprisoned: 5,
        fled: 5,
      },
      market: {
        totalMarketCap: 1000000000,
        companyCount: 50,
      },
      ...overrides,
    },
  };
}

describe('useWorldStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockWorldStatusResponse()),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should start with loading state', () => {
      const { result } = renderHook(() => useWorldStatus());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.worldStatus).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should fetch world status on mount', async () => {
      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/world/status'),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should not fetch when enabled is false', async () => {
      const { result } = renderHook(() => useWorldStatus({ enabled: false }));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('data fetching', () => {
    it('should populate worldStatus with fetched data', async () => {
      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus).not.toBeNull();
      });

      expect(result.current.worldStatus?.tick).toBe(1000);
      expect(result.current.worldStatus?.marketOpen).toBe(true);
      expect(result.current.worldStatus?.regime).toBe('normal');
      expect(result.current.worldStatus?.interestRate).toBe(0.05);
      expect(result.current.worldStatus?.inflationRate).toBe(0.02);
    });

    it('should handle bull regime', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockWorldStatusResponse({ regime: 'bull' })),
      });

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus?.regime).toBe('bull');
      });
    });

    it('should handle bear regime', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockWorldStatusResponse({ regime: 'bear' })),
      });

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus?.regime).toBe('bear');
      });
    });

    it('should handle crash regime', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockWorldStatusResponse({ regime: 'crash' })),
      });

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus?.regime).toBe('crash');
      });
    });

    it('should handle bubble regime', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockWorldStatusResponse({ regime: 'bubble' })),
      });

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus?.regime).toBe('bubble');
      });
    });
  });

  describe('error handling', () => {
    it('should set error on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('Network error');
    });

    it('should set error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toContain('500');
    });

    it('should set error when success is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'World state not initialized' }),
      });

      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.error).not.toBeNull();
      });

      expect(result.current.error?.message).toBe('World state not initialized');
    });
  });

  describe('refetch', () => {
    it('should allow manual refetch', async () => {
      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus).not.toBeNull();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Manually trigger refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should update data on refetch', async () => {
      const { result } = renderHook(() => useWorldStatus());

      await waitFor(() => {
        expect(result.current.worldStatus?.tick).toBe(1000);
      });

      // Update mock response for refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockWorldStatusResponse({ tick: 2000 })),
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.worldStatus?.tick).toBe(2000);
    });
  });

  describe('cleanup', () => {
    it('should abort in-flight request on unmount', async () => {
      const capturedSignals: AbortSignal[] = [];
      mockFetch.mockImplementation((
        _url: string,
        options?: { signal?: AbortSignal }
      ) => {
        if (options?.signal) {
          capturedSignals.push(options.signal);
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve(createMockWorldStatusResponse()),
            });
          }, 100);
        });
      });

      const { unmount } = renderHook(() => useWorldStatus());

      // Unmount while request is in flight
      unmount();

      expect(capturedSignals.length).toBeGreaterThan(0);
      expect(capturedSignals[0].aborted).toBe(true);
    });
  });
});
