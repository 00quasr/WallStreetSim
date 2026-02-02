import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentProfile } from './AgentProfile';
import type { LeaderboardEntry } from '@wallstreetsim/types';

// Mock the Panel component
vi.mock('../ui/Panel', () => ({
  Panel: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="panel" data-title={title}>{children}</div>
  ),
}));

// Mock the ProgressBar component
vi.mock('../ui/ProgressBar', () => ({
  ProgressBar: ({ value, label }: { value: number; label: string }) => (
    <div data-testid="progress-bar" data-value={value} data-label={label}>
      {label}: {value}%
    </div>
  ),
}));

const createMockAgent = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  agentId: 'agent-123',
  name: 'TestAgent',
  role: 'hedge_fund_manager',
  netWorth: 1000000,
  change24h: 5.5,
  status: 'active',
  ...overrides,
});

describe('AgentProfile', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the panel with agent name in title', () => {
      const agent = createMockAgent({ name: 'AlphaTrader' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const panel = screen.getByTestId('panel');
      expect(panel).toHaveAttribute('data-title', 'AGENT PROFILE: ALPHATRADER');
    });

    it('should render agent name', () => {
      const agent = createMockAgent({ name: 'BetaInvestor' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('BetaInvestor')).toBeInTheDocument();
    });

    it('should render agent rank', () => {
      const agent = createMockAgent({ rank: 42 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      // Rank appears multiple times (header and quick stats)
      const rankElements = screen.getAllByText('#42');
      expect(rankElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should render agent ID', () => {
      const agent = createMockAgent({ agentId: 'unique-agent-id-123' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('unique-agent-id-123')).toBeInTheDocument();
    });

    it('should render close button', () => {
      const agent = createMockAgent();

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByLabelText('Close profile')).toBeInTheDocument();
    });
  });

  describe('role display', () => {
    it.each([
      ['hedge_fund_manager', 'Hedge Fund Manager'],
      ['retail_trader', 'Retail Trader'],
      ['ceo', 'CEO'],
      ['investment_banker', 'Investment Banker'],
      ['financial_journalist', 'Financial Journalist'],
      ['sec_investigator', 'SEC Investigator'],
      ['whistleblower', 'Whistleblower'],
      ['quant', 'Quant'],
      ['influencer', 'Influencer'],
    ] as const)('should display correct name for role %s', (role, displayName) => {
      const agent = createMockAgent({ role });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText(displayName)).toBeInTheDocument();
    });

    it('should render role description', () => {
      const agent = createMockAgent({ role: 'hedge_fund_manager' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText(/Manages large pools of capital/)).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should display ACTIVE status with correct styling', () => {
      const agent = createMockAgent({ status: 'active' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const statusElements = screen.getAllByText('ACTIVE');
      expect(statusElements.length).toBeGreaterThan(0);
    });

    it('should display IMPRISONED status with correct styling', () => {
      const agent = createMockAgent({ status: 'imprisoned' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const statusElements = screen.getAllByText('IMPRISONED');
      expect(statusElements.length).toBeGreaterThan(0);
    });

    it('should display BANKRUPT status with correct styling', () => {
      const agent = createMockAgent({ status: 'bankrupt' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const statusElements = screen.getAllByText('BANKRUPT');
      expect(statusElements.length).toBeGreaterThan(0);
    });

    it('should display FLED status with correct styling', () => {
      const agent = createMockAgent({ status: 'fled' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const statusElements = screen.getAllByText('FLED');
      expect(statusElements.length).toBeGreaterThan(0);
    });

    it('should render ASCII art for active status', () => {
      const agent = createMockAgent({ status: 'active' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText(/TRADING/)).toBeInTheDocument();
    });

    it('should render ASCII art for imprisoned status', () => {
      const agent = createMockAgent({ status: 'imprisoned' });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText(/IN PRISON/)).toBeInTheDocument();
    });
  });

  describe('financial information', () => {
    it('should format net worth in billions', () => {
      const agent = createMockAgent({ netWorth: 2500000000 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('$2.50B')).toBeInTheDocument();
    });

    it('should format net worth in millions', () => {
      const agent = createMockAgent({ netWorth: 15000000 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('$15.00M')).toBeInTheDocument();
    });

    it('should format net worth in thousands', () => {
      const agent = createMockAgent({ netWorth: 750000 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('$750.00K')).toBeInTheDocument();
    });

    it('should format small net worth with commas', () => {
      const agent = createMockAgent({ netWorth: 500 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('$500')).toBeInTheDocument();
    });

    it('should display positive change with up arrow', () => {
      const agent = createMockAgent({ change24h: 7.25 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText(/▲ 7.25%/)).toBeInTheDocument();
    });

    it('should display negative change with down arrow', () => {
      const agent = createMockAgent({ change24h: -3.5 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText(/▼ 3.50%/)).toBeInTheDocument();
    });

    it('should render progress bar for performance', () => {
      const agent = createMockAgent({ change24h: 10 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    });

    it('should label progress bar as GAINS for positive change', () => {
      const agent = createMockAgent({ change24h: 5 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toHaveAttribute('data-label', 'GAINS');
    });

    it('should label progress bar as LOSSES for negative change', () => {
      const agent = createMockAgent({ change24h: -5 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const progressBar = screen.getByTestId('progress-bar');
      expect(progressBar).toHaveAttribute('data-label', 'LOSSES');
    });
  });

  describe('quick stats', () => {
    it('should display rank position', () => {
      const agent = createMockAgent({ rank: 15 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      // There will be multiple #15 elements, one in header and one in quick stats
      const rankElements = screen.getAllByText('#15');
      expect(rankElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should display 24H change percentage with sign', () => {
      const agent = createMockAgent({ change24h: 12.34 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('+12.34%')).toBeInTheDocument();
    });

    it('should display negative 24H change without extra sign', () => {
      const agent = createMockAgent({ change24h: -8.5 });

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      expect(screen.getByText('-8.50%')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onClose when close button is clicked', () => {
      const agent = createMockAgent();

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const closeButton = screen.getByLabelText('Close profile');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('accessibility', () => {
    it('should have accessible close button', () => {
      const agent = createMockAgent();

      render(<AgentProfile agent={agent} onClose={mockOnClose} />);

      const closeButton = screen.getByLabelText('Close profile');
      expect(closeButton).toBeInTheDocument();
      expect(closeButton).toHaveAccessibleName('Close profile');
    });
  });
});
