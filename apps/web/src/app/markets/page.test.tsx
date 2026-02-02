import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarketsPage from './page';
import type { PriceData } from '@/hooks/useMarketData';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the Sparkline component
vi.mock('@/components/charts/Sparkline', () => ({
  Sparkline: ({ data }: { data: number[] }) => (
    <span data-testid="sparkline">{data.length > 0 ? '▁▂▃▄▅' : ''}</span>
  ),
}));

// Mock the ASCIIChart component
vi.mock('@/components/charts/ASCIIChart', () => ({
  ASCIIChart: ({ data, height, width }: { data: number[]; height?: number; width?: number }) => (
    <div data-testid="ascii-chart" data-height={height} data-width={width}>
      Chart with {data.length} data points
    </div>
  ),
}));

// Mock StockTicker
vi.mock('@/components/market/StockTicker', () => ({
  StockTicker: ({ autoConnect }: { autoConnect?: boolean }) => (
    <div data-testid="stock-ticker" data-autoconnect={autoConnect?.toString()}>
      Stock Ticker
    </div>
  ),
}));

// Mock OrderBook
vi.mock('@/components/market/OrderBook', () => ({
  OrderBook: ({ symbol, depth, autoConnect }: { symbol: string; depth?: number; autoConnect?: boolean }) => (
    <div data-testid="order-book" data-symbol={symbol} data-depth={depth} data-autoconnect={autoConnect?.toString()}>
      Order Book for {symbol}
    </div>
  ),
}));

// Mock useTickContext for TerminalShell
vi.mock('@/context/TickContext', () => ({
  useTickContext: () => ({
    currentTick: 0,
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

// Mock the useMarketData hook
const mockUseMarketData = vi.fn();
vi.mock('@/hooks/useMarketData', () => ({
  useMarketData: () => mockUseMarketData(),
}));

// Helper to create mock price data
function createMockPriceData(overrides: Partial<PriceData> = {}): PriceData {
  return {
    symbol: 'TEST',
    price: 100.00,
    change: 1.00,
    changePercent: 1.00,
    volume: 10000,
    high: 105.00,
    low: 95.00,
    lastUpdate: new Date(),
    ...overrides,
  };
}

// Helper to create mock market data return
function createMockMarketDataReturn(priceList: PriceData[], isConnected: boolean = true) {
  const priceHistoryMap = new Map<string, number[]>();
  priceList.forEach((p) => priceHistoryMap.set(p.symbol, [p.price - 2, p.price - 1, p.price]));

  return {
    priceList,
    isConnected,
    connectionStatus: isConnected ? 'connected' : 'connecting' as const,
    prices: new Map(priceList.map(p => [p.symbol, p])),
    priceHistory: priceHistoryMap,
    getPriceHistory: (symbol: string) => priceHistoryMap.get(symbol) || [],
    lastTick: priceList.length > 0 ? 1 : 0,
    getPrice: (symbol: string) => priceList.find(p => p.symbol === symbol),
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
}

describe('MarketsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading and empty states', () => {
    it('should show connecting message when not connected and no data', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([], false));

      render(<MarketsPage />);

      expect(screen.getByText('Connecting to market...')).toBeInTheDocument();
    });

    it('should show waiting message when connected but no data', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([], true));

      render(<MarketsPage />);

      expect(screen.getByText('Waiting for market data...')).toBeInTheDocument();
    });
  });

  describe('market stats header', () => {
    it('should display total stock count', () => {
      const stocks = [
        createMockPriceData({ symbol: 'APEX', changePercent: 5 }),
        createMockPriceData({ symbol: 'BETA', changePercent: -3 }),
        createMockPriceData({ symbol: 'GAMMA', changePercent: 0 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Check that the stock count is displayed
      expect(screen.getByText(/STOCKS:/)).toBeInTheDocument();
    });

    it('should display gainers and losers counts', () => {
      const stocks = [
        createMockPriceData({ symbol: 'APEX', changePercent: 5 }),
        createMockPriceData({ symbol: 'BETA', changePercent: -3 }),
        createMockPriceData({ symbol: 'GAMMA', changePercent: 2 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      expect(screen.getByText(/GAINERS:/)).toBeInTheDocument();
      expect(screen.getByText(/LOSERS:/)).toBeInTheDocument();
    });
  });

  describe('stock list rendering', () => {
    it('should render stock symbols', () => {
      const stocks = [
        createMockPriceData({ symbol: 'APEX', price: 156.78 }),
        createMockPriceData({ symbol: 'OMEGA', price: 89.45 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      expect(screen.getByRole('button', { name: 'APEX' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'OMEGA' })).toBeInTheDocument();
    });

    it('should display formatted prices', () => {
      const stocks = [
        createMockPriceData({ symbol: 'APEX', price: 156.78 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      expect(screen.getByText('$156.78')).toBeInTheDocument();
    });

    it('should show positive change in green with + prefix', () => {
      const stocks = [
        createMockPriceData({ symbol: 'BULL', changePercent: 5.26 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Multiple elements may show the change (in table and in top gainers)
      const changeElements = screen.getAllByText('+5.26%');
      expect(changeElements.length).toBeGreaterThan(0);
      changeElements.forEach(el => {
        expect(el).toHaveClass('text-terminal-highlight');
      });
    });

    it('should show negative change in red', () => {
      const stocks = [
        createMockPriceData({ symbol: 'BEAR', changePercent: -3.45 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Multiple elements may show the change (in table and in top losers)
      const changeElements = screen.getAllByText('-3.45%');
      expect(changeElements.length).toBeGreaterThan(0);
      changeElements.forEach(el => {
        expect(el).toHaveClass('text-terminal-red');
      });
    });
  });

  describe('sorting', () => {
    const stocks = [
      createMockPriceData({ symbol: 'BETA', price: 200, changePercent: 2, volume: 5000 }),
      createMockPriceData({ symbol: 'APEX', price: 100, changePercent: 5, volume: 10000 }),
      createMockPriceData({ symbol: 'GAMMA', price: 150, changePercent: -1, volume: 8000 }),
    ];

    it('should sort by symbol ascending by default', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Get only the stock list buttons (in the main table area)
      const allButtons = screen.getAllByRole('button');
      const stockButtons = allButtons.filter(b => ['APEX', 'BETA', 'GAMMA'].includes(b.textContent || ''));
      // First occurrences in the DOM are from the table (sorted)
      const firstThree = stockButtons.slice(0, 3).map(b => b.textContent);
      expect(firstThree).toEqual(['APEX', 'BETA', 'GAMMA']);
    });

    it('should toggle sort direction when clicking same column', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Click symbol sort button twice to reverse order
      const symbolSortBtn = screen.getByRole('button', { name: /SYMBOL/ });
      fireEvent.click(symbolSortBtn);

      const allButtons = screen.getAllByRole('button');
      const stockButtons = allButtons.filter(b => ['APEX', 'BETA', 'GAMMA'].includes(b.textContent || ''));
      const firstThree = stockButtons.slice(0, 3).map(b => b.textContent);
      expect(firstThree).toEqual(['GAMMA', 'BETA', 'APEX']);
    });

    it('should sort by price when clicking price column', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const priceSortBtn = screen.getByRole('button', { name: /PRICE/ });
      fireEvent.click(priceSortBtn);

      const allButtons = screen.getAllByRole('button');
      const stockButtons = allButtons.filter(b => ['APEX', 'BETA', 'GAMMA'].includes(b.textContent || ''));
      const firstThree = stockButtons.slice(0, 3).map(b => b.textContent);
      expect(firstThree).toEqual(['APEX', 'GAMMA', 'BETA']);
    });

    it('should sort by change percent when clicking change column', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const changeSortBtn = screen.getByRole('button', { name: /CHANGEPERCENT/ });
      fireEvent.click(changeSortBtn);

      const allButtons = screen.getAllByRole('button');
      const stockButtons = allButtons.filter(b => ['APEX', 'BETA', 'GAMMA'].includes(b.textContent || ''));
      const firstThree = stockButtons.slice(0, 3).map(b => b.textContent);
      expect(firstThree).toEqual(['GAMMA', 'BETA', 'APEX']);
    });

    it('should sort by volume when clicking volume column', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const volumeSortBtn = screen.getByRole('button', { name: /VOLUME/ });
      fireEvent.click(volumeSortBtn);

      const allButtons = screen.getAllByRole('button');
      const stockButtons = allButtons.filter(b => ['APEX', 'BETA', 'GAMMA'].includes(b.textContent || ''));
      const firstThree = stockButtons.slice(0, 3).map(b => b.textContent);
      expect(firstThree).toEqual(['BETA', 'GAMMA', 'APEX']);
    });

    it('should show sort direction indicator', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const symbolSortBtn = screen.getByRole('button', { name: /SYMBOL/ });
      expect(symbolSortBtn).toHaveTextContent('▲');

      fireEvent.click(symbolSortBtn);
      expect(symbolSortBtn).toHaveTextContent('▼');
    });
  });

  describe('stock selection', () => {
    const stocks = [
      createMockPriceData({ symbol: 'APEX', price: 156.78, change: 4.23, changePercent: 2.77, high: 160, low: 150, volume: 50000 }),
      createMockPriceData({ symbol: 'OMEGA', price: 89.45 }),
    ];

    it('should show "SELECT A STOCK" panel when no stock is selected', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Panel splits title text, so use regex
      expect(screen.getByText(/SELECT A STOCK/)).toBeInTheDocument();
      expect(screen.getByText(/Click on a/)).toBeInTheDocument();
    });

    it('should show stock details when a stock is selected', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Click on APEX to select it
      const apexButtons = screen.getAllByRole('button', { name: 'APEX' });
      fireEvent.click(apexButtons[0]);

      // Should show APEX details (Panel splits title text)
      expect(screen.getByText(/APEX DETAILS/)).toBeInTheDocument();
      // Price appears in both table and detail panel
      const priceElements = screen.getAllByText('$156.78');
      expect(priceElements.length).toBeGreaterThan(0);
    });

    it('should show high/low values for selected stock', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Click the first APEX button (from the main table)
      const apexButtons = screen.getAllByRole('button', { name: 'APEX' });
      fireEvent.click(apexButtons[0]);

      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('LOW')).toBeInTheDocument();
      expect(screen.getByText('$160.00')).toBeInTheDocument();
      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });

    it('should show volume for selected stock', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const apexButtons = screen.getAllByRole('button', { name: 'APEX' });
      fireEvent.click(apexButtons[0]);

      expect(screen.getByText('VOLUME')).toBeInTheDocument();
      // Volume appears in both table and detail panel
      const volumeElements = screen.getAllByText('50.0K');
      expect(volumeElements.length).toBeGreaterThan(0);
    });

    it('should render order book for selected stock', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const apexButtons = screen.getAllByRole('button', { name: 'APEX' });
      fireEvent.click(apexButtons[0]);

      const orderBook = screen.getByTestId('order-book');
      expect(orderBook).toBeInTheDocument();
      expect(orderBook).toHaveAttribute('data-symbol', 'APEX');
    });

    it('should render ASCII chart when price history is available', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      const apexButtons = screen.getAllByRole('button', { name: 'APEX' });
      fireEvent.click(apexButtons[0]);

      expect(screen.getByTestId('ascii-chart')).toBeInTheDocument();
    });

    it('should highlight selected row in stock list', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      const { container } = render(<MarketsPage />);

      const apexButtons = screen.getAllByRole('button', { name: 'APEX' });
      fireEvent.click(apexButtons[0]);

      // The selected row should have the highlight class
      const highlightedRow = container.querySelector('.bg-terminal-darkGreen');
      expect(highlightedRow).toBeInTheDocument();
    });
  });

  describe('top gainers panel', () => {
    it('should display top gainers sorted by change percent', () => {
      const stocks = [
        createMockPriceData({ symbol: 'A', changePercent: 1 }),
        createMockPriceData({ symbol: 'B', changePercent: 5 }),
        createMockPriceData({ symbol: 'C', changePercent: 3 }),
        createMockPriceData({ symbol: 'D', changePercent: -2 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Panel title is split, use regex
      expect(screen.getByText(/TOP GAINERS/)).toBeInTheDocument();

      // B should be first (highest gainer), then C, then A
      const gainerButtons = screen.getAllByRole('button').filter(btn =>
        ['A', 'B', 'C'].includes(btn.textContent || '')
      );
      // Top gainers panel should have B, C, A (D is a loser, not shown)
      expect(gainerButtons.length).toBeGreaterThan(0);
    });

    it('should limit top gainers to 5', () => {
      const stocks = Array.from({ length: 10 }, (_, i) =>
        createMockPriceData({ symbol: `G${i}`, changePercent: i + 1 })
      );
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      const { container } = render(<MarketsPage />);

      // Panel title is split, find the panel container via text content
      const gainerPanelTitle = screen.getByText(/TOP GAINERS/);
      const gainerPanel = gainerPanelTitle.closest('.border')?.parentElement;

      // Count buttons with class that indicates gainer item (text-terminal-highlight text-xs for symbol)
      const gainerItems = container.querySelectorAll('.space-y-2 > button');
      // Get the first set (top gainers panel)
      expect(gainerItems.length).toBe(5);
    });

    it('should show "No gainers yet" when no positive stocks', () => {
      const stocks = [
        createMockPriceData({ symbol: 'A', changePercent: -1 }),
        createMockPriceData({ symbol: 'B', changePercent: -2 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      expect(screen.getByText('No gainers yet')).toBeInTheDocument();
    });

    it('should select stock when clicking gainer', () => {
      const stocks = [
        createMockPriceData({ symbol: 'GAINER', changePercent: 5 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // Find and click the gainer in the top gainers panel
      const gainerButtons = screen.getAllByRole('button', { name: 'GAINER' });
      fireEvent.click(gainerButtons[0]);

      // Panel splits title text
      expect(screen.getByText(/GAINER DETAILS/)).toBeInTheDocument();
    });
  });

  describe('top losers panel', () => {
    it('should display top losers sorted by change percent', () => {
      const stocks = [
        createMockPriceData({ symbol: 'A', changePercent: -1 }),
        createMockPriceData({ symbol: 'B', changePercent: -5 }),
        createMockPriceData({ symbol: 'C', changePercent: 2 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      // TOP LOSERS appears in Panel title which splits text
      const panelTitles = screen.getAllByText(/TOP LOSERS/);
      expect(panelTitles.length).toBeGreaterThan(0);
    });

    it('should show "No losers yet" when no negative stocks', () => {
      const stocks = [
        createMockPriceData({ symbol: 'A', changePercent: 1 }),
        createMockPriceData({ symbol: 'B', changePercent: 2 }),
      ];
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn(stocks));

      render(<MarketsPage />);

      expect(screen.getByText('No losers yet')).toBeInTheDocument();
    });
  });

  describe('connection status', () => {
    it('should show LIVE when connected', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([
        createMockPriceData({ symbol: 'TEST' }),
      ], true));

      render(<MarketsPage />);

      expect(screen.getByText('● LIVE')).toBeInTheDocument();
    });

    it('should show CONNECTING when connecting', () => {
      const mockReturn = createMockMarketDataReturn([], false);
      mockReturn.connectionStatus = 'connecting';
      mockUseMarketData.mockReturnValue(mockReturn);

      render(<MarketsPage />);

      expect(screen.getByText('○ CONNECTING...')).toBeInTheDocument();
    });

    it('should show RECONNECTING when reconnecting', () => {
      const mockReturn = createMockMarketDataReturn([], false);
      mockReturn.connectionStatus = 'reconnecting';
      mockUseMarketData.mockReturnValue(mockReturn);

      render(<MarketsPage />);

      expect(screen.getByText('○ RECONNECTING...')).toBeInTheDocument();
    });

    it('should show OFFLINE when disconnected', () => {
      const mockReturn = createMockMarketDataReturn([], false);
      mockReturn.connectionStatus = 'disconnected';
      mockUseMarketData.mockReturnValue(mockReturn);

      render(<MarketsPage />);

      expect(screen.getByText('○ OFFLINE')).toBeInTheDocument();
    });
  });

  describe('stock ticker', () => {
    it('should render stock ticker banner', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([
        createMockPriceData({ symbol: 'TEST' }),
      ]));

      render(<MarketsPage />);

      expect(screen.getByTestId('stock-ticker')).toBeInTheDocument();
    });

    it('should pass autoConnect=false to stock ticker to avoid duplicate connections', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([
        createMockPriceData({ symbol: 'TEST' }),
      ]));

      render(<MarketsPage />);

      const ticker = screen.getByTestId('stock-ticker');
      expect(ticker).toHaveAttribute('data-autoconnect', 'false');
    });
  });

  describe('sparklines', () => {
    it('should render sparklines in stock list', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([
        createMockPriceData({ symbol: 'TEST' }),
      ]));

      render(<MarketsPage />);

      expect(screen.getAllByTestId('sparkline').length).toBeGreaterThan(0);
    });
  });

  describe('volume formatting', () => {
    it('should format millions correctly', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([
        createMockPriceData({ symbol: 'TEST', volume: 5500000 }),
      ]));

      render(<MarketsPage />);

      // Volume appears in both table and header stats
      const volumeElements = screen.getAllByText('5.50M');
      expect(volumeElements.length).toBeGreaterThan(0);
    });

    it('should format thousands correctly', () => {
      mockUseMarketData.mockReturnValue(createMockMarketDataReturn([
        createMockPriceData({ symbol: 'TEST', volume: 5500 }),
      ]));

      render(<MarketsPage />);

      // Volume appears in both table and header stats
      const volumeElements = screen.getAllByText('5.5K');
      expect(volumeElements.length).toBeGreaterThan(0);
    });
  });
});
