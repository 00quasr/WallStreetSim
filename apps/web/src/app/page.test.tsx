import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from './page';
import type { WorldStatus } from '@/hooks/useWorldStatus';
import type { PriceData } from '@/hooks/useMarketData';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the ASCIIChart component
vi.mock('@/components/charts/ASCIIChart', () => ({
  ASCIIChart: ({ data, height }: { data: number[]; height?: number }) => (
    <div data-testid="ascii-chart" data-height={height}>
      Chart with {data.length} data points
    </div>
  ),
}));

// Mock StockTicker
vi.mock('@/components/market/StockTicker', () => ({
  StockTicker: () => <div data-testid="stock-ticker">Stock Ticker</div>,
}));

// Mock LiveFeed
vi.mock('@/components/feed/LiveFeed', () => ({
  LiveFeed: () => <div data-testid="live-feed">Live Feed</div>,
}));

// Mock WorldStatus component
vi.mock('@/components/world/WorldStatus', () => ({
  WorldStatus: () => <div data-testid="world-status-component">World Status Component</div>,
}));

// Mock PendingOrders
vi.mock('@/components/market/PendingOrders', () => ({
  PendingOrders: () => <div data-testid="pending-orders">Pending Orders</div>,
}));

// Mock SECMostWanted
vi.mock('@/components/sec/SECMostWanted', () => ({
  SECMostWanted: () => <div data-testid="sec-most-wanted">SEC Most Wanted</div>,
}));

// Mock PrisonPopulation
vi.mock('@/components/sec/PrisonPopulation', () => ({
  PrisonPopulation: () => <div data-testid="prison-population">Prison Population</div>,
}));

// Mock RecentBankruptcies
vi.mock('@/components/agents/RecentBankruptcies', () => ({
  RecentBankruptcies: () => <div data-testid="recent-bankruptcies">Recent Bankruptcies</div>,
}));

// Mock useTickContext
vi.mock('@/context/TickContext', () => ({
  useTickContext: () => ({
    currentTick: 12345,
    timestamp: null,
    marketOpen: true,
    regime: 'normal',
    priceUpdates: [],
    trades: [],
    events: [],
    news: [],
    isConnected: true,
    connectionStatus: 'connected',
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Mock useLeaderboard
const mockUseLeaderboard = vi.fn();
vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => mockUseLeaderboard(),
}));

// Mock useWorldStatus
const mockUseWorldStatus = vi.fn();
vi.mock('@/hooks/useWorldStatus', () => ({
  useWorldStatus: () => mockUseWorldStatus(),
}));

// Mock useMarketData
const mockUseMarketData = vi.fn();
vi.mock('@/hooks/useMarketData', () => ({
  useMarketData: () => mockUseMarketData(),
}));

// Helper to create mock world status
function createMockWorldStatus(overrides: Partial<WorldStatus> = {}): WorldStatus {
  return {
    tick: 12345,
    marketOpen: true,
    regime: 'normal',
    interestRate: 0.05,
    inflationRate: 0.02,
    gdpGrowth: 0.03,
    lastTickAt: '2024-01-01T00:00:00Z',
    agents: {
      total: 1000,
      active: 847,
      bankrupt: 156,
      imprisoned: 23,
      fled: 5,
    },
    market: {
      totalMarketCap: 2400000000000, // $2.4T
      companyCount: 50,
    },
    ...overrides,
  };
}

// Helper to create mock price data
function createMockPriceData(overrides: Partial<PriceData> = {}): PriceData {
  return {
    symbol: 'TEST',
    price: 100.0,
    change: 1.0,
    changePercent: 1.0,
    volume: 10000,
    high: 105.0,
    low: 95.0,
    lastUpdate: new Date(),
    ...overrides,
  };
}

// Helper to create mock market data return
function createMockMarketDataReturn(priceList: PriceData[]) {
  return {
    priceList,
    prices: new Map(priceList.map((p) => [p.symbol, p])),
    priceHistory: new Map(),
    getPriceHistory: () => [],
    lastTick: 0,
    getPrice: (symbol: string) => priceList.find((p) => p.symbol === symbol),
    isConnected: true,
    connectionStatus: 'connected' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLeaderboard.mockReturnValue({
      topAgents: [],
      isConnected: true,
    });
    mockUseWorldStatus.mockReturnValue({
      worldStatus: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    mockUseMarketData.mockReturnValue(createMockMarketDataReturn([]));
  });

  describe('market stats display', () => {
    it('should show loading placeholders when world status is not available', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      // Should show '---' placeholder for market cap
      expect(screen.getAllByText('---').length).toBeGreaterThan(0);
    });

    it('should display market cap from world status', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          market: { totalMarketCap: 2400000000000, companyCount: 50 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText('MARKET CAP')).toBeInTheDocument();
      expect(screen.getByText('$2.40T')).toBeInTheDocument();
    });

    it('should display active agents from world status', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          agents: { total: 1000, active: 847, bankrupt: 100, imprisoned: 50, fled: 3 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText('ACTIVE AGENTS')).toBeInTheDocument();
      expect(screen.getByText('847')).toBeInTheDocument();
    });

    it('should display 24h volume from market data', () => {
      mockUseMarketData.mockReturnValue(
        createMockMarketDataReturn([
          createMockPriceData({ symbol: 'APEX', price: 100, volume: 5000000 }),
          createMockPriceData({ symbol: 'BETA', price: 50, volume: 2000000 }),
        ])
      );
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus(),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText('24H VOLUME')).toBeInTheDocument();
      // Total volume = (5000000 * 100) + (2000000 * 50) = 600M
      expect(screen.getByText('$600.00M')).toBeInTheDocument();
    });

    it('should show --- when no volume data available', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([]));
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus(),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      // Multiple '---' placeholders expected
      const dashPlaceholders = screen.getAllByText('---');
      expect(dashPlaceholders.length).toBeGreaterThan(0);
    });
  });

  describe('market cap formatting', () => {
    it('should format trillions correctly', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          market: { totalMarketCap: 2400000000000, companyCount: 50 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText('$2.40T')).toBeInTheDocument();
    });

    it('should format billions correctly', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          market: { totalMarketCap: 850000000000, companyCount: 50 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText('$850.00B')).toBeInTheDocument();
    });

    it('should format millions correctly', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          market: { totalMarketCap: 500000000, companyCount: 50 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText('$500.00M')).toBeInTheDocument();
    });
  });

  describe('volume formatting', () => {
    it('should format billions correctly', () => {
      mockUseMarketData.mockReturnValue(
        createMockMarketDataReturn([
          createMockPriceData({ symbol: 'APEX', price: 100, volume: 50000000 }),
        ])
      );
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus(),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      // 50000000 * 100 = 5B
      expect(screen.getByText('$5.00B')).toBeInTheDocument();
    });

    it('should format millions correctly', () => {
      mockUseMarketData.mockReturnValue(
        createMockMarketDataReturn([
          createMockPriceData({ symbol: 'APEX', price: 100, volume: 5000000 }),
        ])
      );
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus(),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      // 5000000 * 100 = 500M
      expect(screen.getByText('$500.00M')).toBeInTheDocument();
    });
  });

  describe('footer stats', () => {
    it('should display current tick in footer', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus(),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText(/TICK: 12,345/)).toBeInTheDocument();
    });

    it('should display agents count in footer', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          agents: { total: 1000, active: 500, bankrupt: 100, imprisoned: 25, fled: 5 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText(/AGENTS: 500/)).toBeInTheDocument();
    });

    it('should display imprisoned count in footer', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          agents: { total: 1000, active: 500, bankrupt: 100, imprisoned: 42, fled: 5 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText(/IN PRISON: 42/)).toBeInTheDocument();
    });

    it('should display bankruptcies count in footer', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          agents: { total: 1000, active: 500, bankrupt: 200, imprisoned: 25, fled: 5 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText(/BANKRUPTCIES: 200/)).toBeInTheDocument();
    });

    it('should display market cap in footer', () => {
      mockUseWorldStatus.mockReturnValue({
        worldStatus: createMockWorldStatus({
          market: { totalMarketCap: 1500000000000, companyCount: 50 },
        }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      });

      render(<DashboardPage />);

      expect(screen.getByText(/MARKET CAP: \$1\.50T/)).toBeInTheDocument();
    });
  });

  describe('component rendering', () => {
    it('should render stock ticker', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('stock-ticker')).toBeInTheDocument();
    });

    it('should render live feed', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('live-feed')).toBeInTheDocument();
    });

    it('should render world status component', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('world-status-component')).toBeInTheDocument();
    });

    it('should render pending orders', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('pending-orders')).toBeInTheDocument();
    });

    it('should render SEC most wanted', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('sec-most-wanted')).toBeInTheDocument();
    });

    it('should render prison population', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('prison-population')).toBeInTheDocument();
    });

    it('should render recent bankruptcies', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('recent-bankruptcies')).toBeInTheDocument();
    });

    it('should render ASCII chart for market overview', () => {
      render(<DashboardPage />);
      expect(screen.getByTestId('ascii-chart')).toBeInTheDocument();
    });
  });

  describe('leaderboard', () => {
    it('should show connecting message when not connected', () => {
      mockUseLeaderboard.mockReturnValue({
        topAgents: [],
        isConnected: false,
      });

      render(<DashboardPage />);

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('should show waiting message when connected but no data', () => {
      mockUseLeaderboard.mockReturnValue({
        topAgents: [],
        isConnected: true,
      });

      render(<DashboardPage />);

      expect(screen.getByText('Waiting for leaderboard data...')).toBeInTheDocument();
    });

    it('should display top 5 agents in leaderboard', () => {
      mockUseLeaderboard.mockReturnValue({
        topAgents: [
          { rank: 1, id: '1', name: 'Agent One', role: 'trader', status: 'active', netWorth: 5000000000, change24h: 10.5 },
          { rank: 2, id: '2', name: 'Agent Two', role: 'trader', status: 'active', netWorth: 4000000000, change24h: -5.2 },
          { rank: 3, id: '3', name: 'Agent Three', role: 'trader', status: 'active', netWorth: 3000000000, change24h: 2.1 },
        ],
        isConnected: true,
      });

      render(<DashboardPage />);

      expect(screen.getByText('Agent One')).toBeInTheDocument();
      expect(screen.getByText('Agent Two')).toBeInTheDocument();
      expect(screen.getByText('Agent Three')).toBeInTheDocument();
    });

    it('should format net worth correctly', () => {
      mockUseLeaderboard.mockReturnValue({
        topAgents: [
          { rank: 1, id: '1', name: 'Billionaire', role: 'trader', status: 'active', netWorth: 5200000000, change24h: 1.0 },
          { rank: 2, id: '2', name: 'Millionaire', role: 'trader', status: 'active', netWorth: 750000000, change24h: 1.0 },
        ],
        isConnected: true,
      });

      render(<DashboardPage />);

      expect(screen.getByText('$5.20B')).toBeInTheDocument();
      expect(screen.getByText('$750.00M')).toBeInTheDocument();
    });

    it('should show positive change in green', () => {
      mockUseLeaderboard.mockReturnValue({
        topAgents: [
          { rank: 1, id: '1', name: 'Winner', role: 'trader', status: 'active', netWorth: 1000000, change24h: 15.5 },
        ],
        isConnected: true,
      });

      render(<DashboardPage />);

      const changeElement = screen.getByText('+15.5%');
      expect(changeElement).toHaveClass('text-terminal-highlight');
    });

    it('should show negative change in red', () => {
      mockUseLeaderboard.mockReturnValue({
        topAgents: [
          { rank: 1, id: '1', name: 'Loser', role: 'trader', status: 'active', netWorth: 1000000, change24h: -8.3 },
        ],
        isConnected: true,
      });

      render(<DashboardPage />);

      const changeElement = screen.getByText('-8.3%');
      expect(changeElement).toHaveClass('text-terminal-red');
    });
  });
});
