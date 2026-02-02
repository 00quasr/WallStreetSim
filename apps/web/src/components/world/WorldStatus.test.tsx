import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorldStatus } from './WorldStatus';
import type { UseWorldStatusReturn, WorldStatus as WorldStatusType } from '@/hooks/useWorldStatus';
import type { MarketRegime, MarketEvent } from '@wallstreetsim/types';
import type { ActiveEvent } from '@/hooks/useActiveEvents';

// Mock useWorldStatus
const mockUseWorldStatus = vi.fn();
vi.mock('@/hooks/useWorldStatus', () => ({
  useWorldStatus: () => mockUseWorldStatus(),
}));

// Mock useTickContext
const mockUseTickContext = vi.fn();
vi.mock('@/context/TickContext', () => ({
  useTickContext: () => mockUseTickContext(),
}));

// Mock useActiveEvents
const mockUseActiveEvents = vi.fn();
vi.mock('@/hooks/useActiveEvents', () => ({
  useActiveEvents: () => mockUseActiveEvents(),
}));

function createMockWorldStatus(overrides?: Partial<WorldStatusType>): WorldStatusType {
  return {
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
  };
}

function createMockUseWorldStatusReturn(overrides?: Partial<UseWorldStatusReturn>): UseWorldStatusReturn {
  return {
    worldStatus: createMockWorldStatus(),
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function createMockTickContext(overrides?: {
  regime?: MarketRegime;
}) {
  return {
    currentTick: 1000,
    timestamp: new Date(),
    marketOpen: true,
    regime: overrides?.regime || 'normal',
    priceUpdates: [],
    trades: [],
    events: [],
    news: [],
    isConnected: true,
    connectionStatus: 'connected',
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockActiveEventsReturn(activeEvents: ActiveEvent[] = []) {
  return {
    activeEvents,
    allEvents: activeEvents as MarketEvent[],
    clearEvents: vi.fn(),
  };
}

describe('WorldStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorldStatus.mockReturnValue(createMockUseWorldStatusReturn());
    mockUseTickContext.mockReturnValue(createMockTickContext());
    mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn());
  });

  describe('loading state', () => {
    it('should show loading message when loading and no data', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          isLoading: true,
          worldStatus: null,
        })
      );

      render(<WorldStatus />);

      expect(screen.getByText(/Loading world status/)).toBeInTheDocument();
    });

    it('should show content when loading but has previous data', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          isLoading: true,
          worldStatus: createMockWorldStatus(),
        })
      );

      render(<WorldStatus />);

      expect(screen.queryByText(/Loading world status/)).not.toBeInTheDocument();
      expect(screen.getByText('MARKET REGIME')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error and no data', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          error: new Error('Network error'),
          worldStatus: null,
        })
      );

      render(<WorldStatus />);

      expect(screen.getByText(/Failed to load world status/)).toBeInTheDocument();
    });

    it('should show content when error but has previous data', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          error: new Error('Network error'),
          worldStatus: createMockWorldStatus(),
        })
      );

      render(<WorldStatus />);

      expect(screen.queryByText(/Failed to load world status/)).not.toBeInTheDocument();
      expect(screen.getByText('MARKET REGIME')).toBeInTheDocument();
    });
  });

  describe('market regime display', () => {
    it('should display NORMAL regime', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ regime: 'normal' }),
        })
      );
      mockUseTickContext.mockReturnValue(createMockTickContext({ regime: 'normal' }));

      render(<WorldStatus />);

      expect(screen.getByText('NORMAL')).toBeInTheDocument();
    });

    it('should display BULL regime with highlight color', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ regime: 'bull' }),
        })
      );
      mockUseTickContext.mockReturnValue(createMockTickContext({ regime: 'bull' }));

      render(<WorldStatus />);

      const regimeLabel = screen.getByText('BULL');
      expect(regimeLabel).toBeInTheDocument();
      expect(regimeLabel).toHaveClass('text-terminal-highlight');
    });

    it('should display BEAR regime with red color', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ regime: 'bear' }),
        })
      );
      mockUseTickContext.mockReturnValue(createMockTickContext({ regime: 'bear' }));

      render(<WorldStatus />);

      const regimeLabel = screen.getByText('BEAR');
      expect(regimeLabel).toBeInTheDocument();
      expect(regimeLabel).toHaveClass('text-terminal-red');
    });

    it('should display CRASH regime with red color', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ regime: 'crash' }),
        })
      );
      mockUseTickContext.mockReturnValue(createMockTickContext({ regime: 'crash' }));

      render(<WorldStatus />);

      const regimeLabel = screen.getByText('CRASH');
      expect(regimeLabel).toBeInTheDocument();
      expect(regimeLabel).toHaveClass('text-terminal-red');
    });

    it('should display BUBBLE regime with yellow color', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ regime: 'bubble' }),
        })
      );
      mockUseTickContext.mockReturnValue(createMockTickContext({ regime: 'bubble' }));

      render(<WorldStatus />);

      const regimeLabel = screen.getByText('BUBBLE');
      expect(regimeLabel).toBeInTheDocument();
      expect(regimeLabel).toHaveClass('text-terminal-yellow');
    });

    it('should prefer WebSocket regime over polled regime', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ regime: 'normal' }),
        })
      );
      mockUseTickContext.mockReturnValue(createMockTickContext({ regime: 'bull' }));

      render(<WorldStatus />);

      expect(screen.getByText('BULL')).toBeInTheDocument();
      expect(screen.queryByText('NORMAL')).not.toBeInTheDocument();
    });
  });

  describe('economic indicators', () => {
    it('should display interest rate as percentage', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ interestRate: 0.0525 }),
        })
      );

      render(<WorldStatus />);

      expect(screen.getByText('INTEREST RATE')).toBeInTheDocument();
      expect(screen.getByText('5.25%')).toBeInTheDocument();
    });

    it('should display inflation rate as percentage', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ inflationRate: 0.032 }),
        })
      );

      render(<WorldStatus />);

      expect(screen.getByText('INFLATION')).toBeInTheDocument();
      expect(screen.getByText('3.2%')).toBeInTheDocument();
    });

    it('should highlight inflation above 3%', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ inflationRate: 0.035 }),
        })
      );

      render(<WorldStatus />);

      const inflationValue = screen.getByText('3.5%');
      expect(inflationValue).toHaveClass('text-terminal-yellow');
    });

    it('should not highlight inflation at or below 3%', () => {
      mockUseWorldStatus.mockReturnValue(
        createMockUseWorldStatusReturn({
          worldStatus: createMockWorldStatus({ inflationRate: 0.025 }),
        })
      );

      render(<WorldStatus />);

      const inflationValue = screen.getByText('2.5%');
      expect(inflationValue).toHaveClass('text-terminal-text');
    });
  });

  describe('active events', () => {
    it('should display "No active events" when events array is empty', () => {
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn([]));

      render(<WorldStatus />);

      expect(screen.getByText('No active events')).toBeInTheDocument();
    });

    it('should display active events from useActiveEvents hook', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'EARNINGS_BEAT',
          symbol: 'APEX',
          impact: 0.05,
          duration: 10,
          tick: 1000,
          headline: 'APEX beats earnings',
          createdAt: new Date(),
          remainingDuration: 10,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      expect(screen.getByText('EARNINGS_BEAT')).toBeInTheDocument();
      expect(screen.getByText('(APEX)')).toBeInTheDocument();
      expect(screen.getByText(/10 ticks remaining/)).toBeInTheDocument();
    });

    it('should limit display to 3 events', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'EARNINGS_BEAT',
          symbol: 'APEX',
          impact: 0.05,
          duration: 10,
          tick: 1000,
          headline: 'Event 1',
          createdAt: new Date(),
          remainingDuration: 10,
        },
        {
          id: 'event-2',
          type: 'CEO_SCANDAL',
          symbol: 'BLCK',
          impact: -0.1,
          duration: 20,
          tick: 1000,
          headline: 'Event 2',
          createdAt: new Date(),
          remainingDuration: 20,
        },
        {
          id: 'event-3',
          type: 'PRODUCT_LAUNCH',
          symbol: 'CYBER',
          impact: 0.03,
          duration: 15,
          tick: 1000,
          headline: 'Event 3',
          createdAt: new Date(),
          remainingDuration: 15,
        },
        {
          id: 'event-4',
          type: 'MERGER_RUMOR',
          symbol: 'DIGI',
          impact: 0.08,
          duration: 30,
          tick: 1000,
          headline: 'Event 4',
          createdAt: new Date(),
          remainingDuration: 30,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      expect(screen.getByText('EARNINGS_BEAT')).toBeInTheDocument();
      expect(screen.getByText('CEO_SCANDAL')).toBeInTheDocument();
      expect(screen.getByText('PRODUCT_LAUNCH')).toBeInTheDocument();
      expect(screen.queryByText('MERGER_RUMOR')).not.toBeInTheDocument();
    });

    it('should display positive events with highlight color', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'EARNINGS_BEAT',
          symbol: 'APEX',
          impact: 0.05,
          duration: 10,
          tick: 1000,
          headline: 'Positive event',
          createdAt: new Date(),
          remainingDuration: 10,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      const eventLabel = screen.getByText('EARNINGS_BEAT');
      expect(eventLabel).toHaveClass('text-terminal-highlight');
    });

    it('should display negative events with yellow color', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'CEO_SCANDAL',
          symbol: 'APEX',
          impact: -0.1,
          duration: 10,
          tick: 1000,
          headline: 'Negative event',
          createdAt: new Date(),
          remainingDuration: 10,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      const eventLabel = screen.getByText('CEO_SCANDAL');
      expect(eventLabel).toHaveClass('text-terminal-yellow');
    });

    it('should not show duration for events with remainingDuration 0', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'EARNINGS_BEAT',
          symbol: 'APEX',
          impact: 0.05,
          duration: 0,
          tick: 1000,
          headline: 'Instant event',
          createdAt: new Date(),
          remainingDuration: 0,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      expect(screen.getByText('EARNINGS_BEAT')).toBeInTheDocument();
      expect(screen.queryByText(/ticks remaining/)).not.toBeInTheDocument();
    });

    it('should display event symbol when present', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'EARNINGS_BEAT',
          symbol: 'APEX',
          impact: 0.05,
          duration: 10,
          tick: 1000,
          headline: 'Event with symbol',
          createdAt: new Date(),
          remainingDuration: 10,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      expect(screen.getByText('(APEX)')).toBeInTheDocument();
    });

    it('should not display symbol parentheses for events without symbol', () => {
      const events: ActiveEvent[] = [
        {
          id: 'event-1',
          type: 'MARKET_CRASH',
          impact: -0.2,
          duration: 10,
          tick: 1000,
          headline: 'Market-wide event',
          createdAt: new Date(),
          remainingDuration: 10,
        },
      ];
      mockUseActiveEvents.mockReturnValue(createMockActiveEventsReturn(events));

      render(<WorldStatus />);

      expect(screen.getByText('MARKET_CRASH')).toBeInTheDocument();
      expect(screen.queryByText(/\([A-Z]+\)/)).not.toBeInTheDocument();
    });
  });

  describe('progress bar', () => {
    it('should display confidence progress bar', () => {
      render(<WorldStatus />);

      expect(screen.getByText('Confidence')).toBeInTheDocument();
    });
  });
});
