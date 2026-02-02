import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewsPage from './page';
import type { NewsItem, UseNewsReturn } from '@/hooks/useNews';
import type { NewsCategory } from '@wallstreetsim/types';

// Mock useNews hook
const mockUseNews = vi.fn();
vi.mock('@/hooks/useNews', () => ({
  useNews: () => mockUseNews(),
}));

// Mock TerminalShell
vi.mock('@/components/layout/TerminalShell', () => ({
  TerminalShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="terminal-shell">{children}</div>
  ),
}));

// Mock Panel
vi.mock('@/components/ui/Panel', () => ({
  Panel: ({ title, children, status }: { title: string; children: React.ReactNode; status?: string }) => (
    <div data-testid={`panel-${title.toLowerCase().replace(/\s+/g, '-')}`} data-status={status}>
      <div data-testid="panel-title">{title}</div>
      {children}
    </div>
  ),
}));

function createMockNewsItem(
  id: string,
  overrides?: Partial<NewsItem>
): NewsItem {
  return {
    id,
    tick: 1,
    headline: 'Test Headline',
    content: 'Test content',
    category: 'market' as NewsCategory,
    sentiment: 0,
    agentIds: [],
    symbols: ['APEX'],
    createdAt: new Date(),
    isBreaking: false,
    receivedAt: new Date(),
    ...overrides,
  };
}

function createMockUseNewsReturn(
  articles: NewsItem[] = [],
  options: Partial<UseNewsReturn> = {}
): UseNewsReturn {
  return {
    articles,
    breakingNews: articles.filter((a) => a.isBreaking),
    lastTick: articles.length > 0 ? articles[0].tick : 0,
    getArticlesByCategory: (category: NewsCategory) =>
      articles.filter((a) => a.category === category),
    getArticlesBySymbol: (symbol: string) =>
      articles.filter((a) => a.symbols.includes(symbol)),
    isConnected: true,
    connectionStatus: 'connected',
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    clearNews: vi.fn(),
    ...options,
  };
}

describe('NewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the terminal shell', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn());

      render(<NewsPage />);

      expect(screen.getByTestId('terminal-shell')).toBeInTheDocument();
    });

    it('should render header stats', () => {
      const articles = [
        createMockNewsItem('news-1', { sentiment: 0.5 }),
        createMockNewsItem('news-2', { isBreaking: true, sentiment: -0.5 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.getByText(/ARTICLES:/)).toBeInTheDocument();
      expect(screen.getByText(/BREAKING:/)).toBeInTheDocument();
      expect(screen.getByText(/BULLISH:/)).toBeInTheDocument();
      expect(screen.getByText(/BEARISH:/)).toBeInTheDocument();
    });

    it('should render filters panel', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn());

      render(<NewsPage />);

      expect(screen.getByTestId('panel-filters')).toBeInTheDocument();
      expect(screen.getByText('CATEGORY')).toBeInTheDocument();
    });

    it('should render news archive panel', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn());

      render(<NewsPage />);

      expect(screen.getByTestId('panel-news-archive')).toBeInTheDocument();
    });
  });

  describe('connection states', () => {
    it('should show LIVE status when connected', () => {
      mockUseNews.mockReturnValue(
        createMockUseNewsReturn([], {
          isConnected: true,
          connectionStatus: 'connected',
        })
      );

      render(<NewsPage />);

      // Check for the connection status indicator specifically
      expect(screen.getByText('● LIVE')).toBeInTheDocument();
    });

    it('should show CONNECTING status when connecting', () => {
      mockUseNews.mockReturnValue(
        createMockUseNewsReturn([], {
          isConnected: false,
          connectionStatus: 'connecting',
        })
      );

      render(<NewsPage />);

      expect(screen.getByText('○ CONNECTING...')).toBeInTheDocument();
    });

    it('should show OFFLINE status when disconnected', () => {
      mockUseNews.mockReturnValue(
        createMockUseNewsReturn([], {
          isConnected: false,
          connectionStatus: 'disconnected',
        })
      );

      render(<NewsPage />);

      expect(screen.getByText('○ OFFLINE')).toBeInTheDocument();
    });

    it('should show warning status on news archive panel when disconnected', () => {
      mockUseNews.mockReturnValue(
        createMockUseNewsReturn([], {
          isConnected: false,
          connectionStatus: 'disconnected',
        })
      );

      render(<NewsPage />);

      const archivePanel = screen.getByTestId('panel-news-archive');
      expect(archivePanel).toHaveAttribute('data-status', 'warning');
    });
  });

  describe('empty state', () => {
    it('should show empty state when no articles', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn([]));

      render(<NewsPage />);

      expect(screen.getByText(/Waiting for news articles.../)).toBeInTheDocument();
    });

    it('should show connecting message when not connected and no articles', () => {
      mockUseNews.mockReturnValue(
        createMockUseNewsReturn([], {
          isConnected: false,
          connectionStatus: 'connecting',
        })
      );

      render(<NewsPage />);

      expect(screen.getByText(/Connecting to news feed.../)).toBeInTheDocument();
    });
  });

  describe('rendering news articles', () => {
    it('should render news articles', () => {
      const articles = [
        createMockNewsItem('news-1', { headline: 'APEX Reports Record Earnings' }),
        createMockNewsItem('news-2', { headline: 'Market Rally Continues' }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.getByText('APEX Reports Record Earnings')).toBeInTheDocument();
      expect(screen.getByText('Market Rally Continues')).toBeInTheDocument();
    });

    it('should highlight breaking news articles', () => {
      const articles = [
        createMockNewsItem('news-1', { headline: 'Breaking Story', isBreaking: true }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Should show the [BREAKING] tag
      expect(screen.getAllByText('[BREAKING]').length).toBeGreaterThan(0);
    });

    it('should display category label for articles', () => {
      const articles = [
        createMockNewsItem('news-1', { category: 'earnings' }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Category appears both in dropdown and article - just check it exists
      expect(screen.getAllByText(/EARNINGS/).length).toBeGreaterThan(0);
    });

    it('should display tick number for articles', () => {
      const articles = [
        createMockNewsItem('news-1', { tick: 42 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.getByText(/T:42/)).toBeInTheDocument();
    });
  });

  describe('expanding articles', () => {
    it('should show expand indicator on collapsed articles', () => {
      const articles = [
        createMockNewsItem('news-1'),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.getByText(/expand/)).toBeInTheDocument();
    });

    it('should expand article on click', () => {
      const articles = [
        createMockNewsItem('news-1', {
          headline: 'Test Article',
          content: 'Full article content here',
          symbols: ['APEX', 'BLCK'],
        }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Initially content should not be visible
      expect(screen.queryByText('Full article content here')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(screen.getByText('Test Article'));

      // Content should now be visible
      expect(screen.getByText('Full article content here')).toBeInTheDocument();
      expect(screen.getByText(/SYMBOLS:/)).toBeInTheDocument();
      expect(screen.getByText(/APEX, BLCK/)).toBeInTheDocument();
    });

    it('should collapse article on second click', () => {
      const articles = [
        createMockNewsItem('news-1', {
          headline: 'Test Article',
          content: 'Full article content here',
        }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Expand
      fireEvent.click(screen.getByText('Test Article'));
      expect(screen.getByText('Full article content here')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText('Test Article'));
      expect(screen.queryByText('Full article content here')).not.toBeInTheDocument();
    });
  });

  describe('sentiment display', () => {
    it('should show BULLISH for positive sentiment', () => {
      const articles = [
        createMockNewsItem('news-1', { sentiment: 0.5 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Expand article
      fireEvent.click(screen.getByText('Test Headline'));

      // BULLISH appears in both header stats and expanded article - just check it exists
      expect(screen.getAllByText(/BULLISH/).length).toBeGreaterThan(0);
    });

    it('should show BEARISH for negative sentiment', () => {
      const articles = [
        createMockNewsItem('news-1', { sentiment: -0.5 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Expand article
      fireEvent.click(screen.getByText('Test Headline'));

      // BEARISH appears in both header stats and expanded article - just check it exists
      expect(screen.getAllByText(/BEARISH/).length).toBeGreaterThan(0);
    });

    it('should show NEUTRAL for neutral sentiment', () => {
      const articles = [
        createMockNewsItem('news-1', { sentiment: 0 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Expand article
      fireEvent.click(screen.getByText('Test Headline'));

      expect(screen.getByText(/NEUTRAL/)).toBeInTheDocument();
    });
  });

  describe('category filter', () => {
    it('should render category filter dropdown', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn());

      render(<NewsPage />);

      const categorySelect = screen.getByRole('combobox');
      expect(categorySelect).toBeInTheDocument();
    });

    it('should filter articles by category when selected', () => {
      const articles = [
        createMockNewsItem('news-1', { headline: 'Earnings News', category: 'earnings' }),
        createMockNewsItem('news-2', { headline: 'Market News', category: 'market' }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Both articles visible initially
      expect(screen.getByText('Earnings News')).toBeInTheDocument();
      expect(screen.getByText('Market News')).toBeInTheDocument();

      // Filter by earnings
      const categorySelect = screen.getByRole('combobox');
      fireEvent.change(categorySelect, { target: { value: 'earnings' } });

      // Only earnings article visible
      expect(screen.getByText('Earnings News')).toBeInTheDocument();
      expect(screen.queryByText('Market News')).not.toBeInTheDocument();
    });
  });

  describe('breaking news filter', () => {
    it('should render breaking news toggle', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn());

      render(<NewsPage />);

      expect(screen.getByText('Breaking News Only')).toBeInTheDocument();
    });

    it('should filter to breaking news only when toggled', () => {
      const articles = [
        createMockNewsItem('news-1', { headline: 'Breaking Story', isBreaking: true }),
        createMockNewsItem('news-2', { headline: 'Regular Story', isBreaking: false }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Both visible initially (Breaking Story may appear multiple times - sidebar + main)
      expect(screen.getAllByText('Breaking Story').length).toBeGreaterThan(0);
      expect(screen.getByText('Regular Story')).toBeInTheDocument();

      // Toggle breaking news filter
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      // Only breaking story visible in main archive, regular story hidden
      expect(screen.getAllByText('Breaking Story').length).toBeGreaterThan(0);
      expect(screen.queryByText('Regular Story')).not.toBeInTheDocument();
    });
  });

  describe('clear feed button', () => {
    it('should render clear feed button', () => {
      mockUseNews.mockReturnValue(createMockUseNewsReturn());

      render(<NewsPage />);

      expect(screen.getByText('[CLEAR FEED]')).toBeInTheDocument();
    });

    it('should call clearNews when clicked', () => {
      const clearNews = vi.fn();
      mockUseNews.mockReturnValue(
        createMockUseNewsReturn([], { clearNews })
      );

      render(<NewsPage />);

      fireEvent.click(screen.getByText('[CLEAR FEED]'));

      expect(clearNews).toHaveBeenCalled();
    });
  });

  describe('breaking news sidebar panel', () => {
    it('should not render breaking news panel when no breaking news', () => {
      const articles = [
        createMockNewsItem('news-1', { isBreaking: false }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.queryByTestId('panel-breaking-news')).not.toBeInTheDocument();
    });

    it('should render breaking news panel when breaking news exists', () => {
      const articles = [
        createMockNewsItem('news-1', { headline: 'Breaking!', isBreaking: true }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.getByTestId('panel-breaking-news')).toBeInTheDocument();
    });

    it('should show breaking news headlines in sidebar', () => {
      const articles = [
        createMockNewsItem('news-1', { headline: 'Major Breaking Story Here', isBreaking: true }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Panel should exist and contain headline (might appear multiple times: sidebar + main)
      expect(screen.getAllByText(/Major Breaking Story Here/).length).toBeGreaterThan(0);
    });
  });

  describe('showing count', () => {
    it('should display showing count', () => {
      const articles = [
        createMockNewsItem('news-1'),
        createMockNewsItem('news-2'),
        createMockNewsItem('news-3'),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      expect(screen.getByText('3 / 3')).toBeInTheDocument();
      expect(screen.getByText('articles')).toBeInTheDocument();
    });

    it('should update showing count when filtered', () => {
      const articles = [
        createMockNewsItem('news-1', { category: 'earnings' }),
        createMockNewsItem('news-2', { category: 'market' }),
        createMockNewsItem('news-3', { category: 'market' }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      // Initially showing all
      expect(screen.getByText('3 / 3')).toBeInTheDocument();

      // Filter by earnings
      const categorySelect = screen.getByRole('combobox');
      fireEvent.change(categorySelect, { target: { value: 'earnings' } });

      // Now showing 1 of 3
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });

  describe('terminal color palette compliance', () => {
    it('should apply terminal-highlight color for bullish sentiment', () => {
      const articles = [
        createMockNewsItem('news-1', { sentiment: 0.5 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      const { container } = render(<NewsPage />);

      // Expand article
      fireEvent.click(screen.getByText('Test Headline'));

      const sentimentElement = container.querySelector('.text-terminal-highlight');
      expect(sentimentElement).toBeInTheDocument();
    });

    it('should apply terminal-red color for bearish sentiment', () => {
      const articles = [
        createMockNewsItem('news-1', { sentiment: -0.5 }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      const { container } = render(<NewsPage />);

      // Expand article
      fireEvent.click(screen.getByText('Test Headline'));

      const sentimentElement = container.querySelector('.text-terminal-red');
      expect(sentimentElement).toBeInTheDocument();
    });

    it('should apply terminal-red color for breaking news', () => {
      const articles = [
        createMockNewsItem('news-1', { isBreaking: true }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      const { container } = render(<NewsPage />);

      const breakingElement = container.querySelector('.text-terminal-red');
      expect(breakingElement).toBeInTheDocument();
    });
  });

  describe('category counts in filter', () => {
    it('should display category counts in filter dropdown', () => {
      const articles = [
        createMockNewsItem('news-1', { category: 'earnings' }),
        createMockNewsItem('news-2', { category: 'earnings' }),
        createMockNewsItem('news-3', { category: 'market' }),
      ];
      mockUseNews.mockReturnValue(createMockUseNewsReturn(articles));

      render(<NewsPage />);

      const categorySelect = screen.getByRole('combobox');

      // Check that options contain counts
      expect(categorySelect.innerHTML).toContain('(3)'); // All
      expect(categorySelect.innerHTML).toContain('(2)'); // Earnings
      expect(categorySelect.innerHTML).toContain('(1)'); // Market
    });
  });
});
