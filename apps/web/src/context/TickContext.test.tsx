import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, renderHook } from '@testing-library/react';
import { TickProvider, useTickContext } from './TickContext';

// Mock useTick hook
const mockUseTick = vi.fn();
vi.mock('../hooks/useTick', () => ({
  useTick: () => mockUseTick(),
}));

describe('TickContext', () => {
  const defaultTickData = {
    currentTick: 0,
    timestamp: null,
    marketOpen: false,
    regime: 'normal' as const,
    priceUpdates: [],
    trades: [],
    events: [],
    news: [],
    isConnected: false,
    connectionStatus: 'disconnected' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  beforeEach(() => {
    mockUseTick.mockReturnValue(defaultTickData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TickProvider', () => {
    it('should render children', () => {
      render(
        <TickProvider>
          <div data-testid="child">Child content</div>
        </TickProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should provide tick data to children', () => {
      const TestComponent = () => {
        const { currentTick, connectionStatus } = useTickContext();
        return (
          <div>
            <span data-testid="tick">{currentTick}</span>
            <span data-testid="status">{connectionStatus}</span>
          </div>
        );
      };

      render(
        <TickProvider>
          <TestComponent />
        </TickProvider>
      );

      expect(screen.getByTestId('tick')).toHaveTextContent('0');
      expect(screen.getByTestId('status')).toHaveTextContent('disconnected');
    });

    it('should provide updated tick data when useTick returns different values', () => {
      mockUseTick.mockReturnValue({
        ...defaultTickData,
        currentTick: 12345,
        isConnected: true,
        connectionStatus: 'connected',
        marketOpen: true,
      });

      const TestComponent = () => {
        const { currentTick, connectionStatus, marketOpen } = useTickContext();
        return (
          <div>
            <span data-testid="tick">{currentTick}</span>
            <span data-testid="status">{connectionStatus}</span>
            <span data-testid="market">{marketOpen ? 'open' : 'closed'}</span>
          </div>
        );
      };

      render(
        <TickProvider>
          <TestComponent />
        </TickProvider>
      );

      expect(screen.getByTestId('tick')).toHaveTextContent('12345');
      expect(screen.getByTestId('status')).toHaveTextContent('connected');
      expect(screen.getByTestId('market')).toHaveTextContent('open');
    });
  });

  describe('useTickContext', () => {
    it('should throw error when used outside TickProvider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useTickContext());
      }).toThrow('useTickContext must be used within a TickProvider');

      consoleSpy.mockRestore();
    });

    it('should return tick data when used within TickProvider', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TickProvider>{children}</TickProvider>
      );

      const { result } = renderHook(() => useTickContext(), { wrapper });

      expect(result.current.currentTick).toBe(0);
      expect(result.current.connectionStatus).toBe('disconnected');
      expect(result.current.isConnected).toBe(false);
    });
  });
});
