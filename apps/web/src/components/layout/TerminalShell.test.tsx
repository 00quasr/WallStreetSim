import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TerminalShell } from './TerminalShell';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock useTickContext hook
const mockUseTickContext = vi.fn();
vi.mock('../../context/TickContext', () => ({
  useTickContext: () => mockUseTickContext(),
}));

describe('TerminalShell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUseTickContext.mockReturnValue({
      currentTick: 0,
      timestamp: null,
      marketOpen: false,
      regime: 'normal',
      priceUpdates: [],
      trades: [],
      events: [],
      news: [],
      isConnected: false,
      connectionStatus: 'disconnected',
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('layout structure', () => {
    it('should render header, main content, and footer', () => {
      render(
        <TerminalShell>
          <div data-testid="content">Test content</div>
        </TerminalShell>
      );

      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should render navigation links', () => {
      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('[HOME]')).toBeInTheDocument();
      expect(screen.getByText('[AGENTS]')).toBeInTheDocument();
      expect(screen.getByText('[MARKETS]')).toBeInTheDocument();
      expect(screen.getByText('[NEWS]')).toBeInTheDocument();
    });

    it('should render WALLSTREETSIM title', () => {
      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('WALLSTREETSIM')).toBeInTheDocument();
      expect(screen.getByText('THE MARKET NEVER SLEEPS')).toBeInTheDocument();
    });

    it('should render tick counter', () => {
      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('TICK')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('connection indicator', () => {
    it('should display disconnected status when WebSocket is disconnected', () => {
      mockUseTickContext.mockReturnValue({
        currentTick: 0,
        timestamp: null,
        marketOpen: false,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
        isConnected: false,
        connectionStatus: 'disconnected',
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    });

    it('should display connected status when WebSocket is connected', () => {
      mockUseTickContext.mockReturnValue({
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
      });

      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('CONNECTED')).toBeInTheDocument();
    });

    it('should display connecting status when WebSocket is connecting', () => {
      mockUseTickContext.mockReturnValue({
        currentTick: 0,
        timestamp: null,
        marketOpen: false,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
        isConnected: false,
        connectionStatus: 'connecting',
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('CONNECTING')).toBeInTheDocument();
    });

    it('should display error status when WebSocket has error', () => {
      mockUseTickContext.mockReturnValue({
        currentTick: 0,
        timestamp: null,
        marketOpen: false,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
        isConnected: false,
        connectionStatus: 'error',
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('ERROR')).toBeInTheDocument();
    });

    it('should render connection status indicator with proper bracket formatting', () => {
      mockUseTickContext.mockReturnValue({
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
      });

      render(<TerminalShell>Content</TerminalShell>);

      // ConnectionStatus uses bracket decorations [●] CONNECTED
      // There are multiple brackets in the layout (nav links, footer), so use getAllByText
      const openBrackets = screen.getAllByText('[');
      const closeBrackets = screen.getAllByText(']');
      expect(openBrackets.length).toBeGreaterThan(0);
      expect(closeBrackets.length).toBeGreaterThan(0);
      // Verify the connection indicator is rendered
      expect(screen.getByText('●')).toBeInTheDocument();
    });
  });

  describe('tick counter', () => {
    it('should display formatted tick value', () => {
      mockUseTickContext.mockReturnValue({
        currentTick: 15234,
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
      });

      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('TICK')).toBeInTheDocument();
      expect(screen.getByText('15,234')).toBeInTheDocument();
    });

    it('should display zero tick when not connected', () => {
      mockUseTickContext.mockReturnValue({
        currentTick: 0,
        timestamp: null,
        marketOpen: false,
        regime: 'normal',
        priceUpdates: [],
        trades: [],
        events: [],
        news: [],
        isConnected: false,
        connectionStatus: 'disconnected',
        connect: vi.fn(),
        disconnect: vi.fn(),
      });

      render(<TerminalShell>Content</TerminalShell>);

      expect(screen.getByText('TICK')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });
});
