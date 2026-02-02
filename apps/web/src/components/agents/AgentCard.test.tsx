import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCard } from './AgentCard';

interface MockAgent {
  id: string;
  name: string;
  role: string;
  netWorth: number;
  change24h: number;
  status: 'active' | 'bankrupt' | 'imprisoned' | 'fled';
  rank: number;
}

const createMockAgent = (overrides: Partial<MockAgent> = {}): MockAgent => ({
  id: 'agent-1',
  name: 'TestAgent',
  role: 'Hedge Fund Manager',
  netWorth: 1000000,
  change24h: 5.5,
  status: 'active',
  rank: 1,
  ...overrides,
});

describe('AgentCard', () => {
  describe('rendering', () => {
    it('should render agent name', () => {
      const agent = createMockAgent({ name: 'AlphaTrader' });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('AlphaTrader')).toBeInTheDocument();
    });

    it('should render agent rank', () => {
      const agent = createMockAgent({ rank: 42 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('#42')).toBeInTheDocument();
    });

    it('should render agent role', () => {
      const agent = createMockAgent({ role: 'Quant Trader' });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('Quant Trader')).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    it('should show ACTIVE status with green indicator', () => {
      const agent = createMockAgent({ status: 'active' });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText(/ACTIVE/)).toBeInTheDocument();
      expect(screen.getByText(/●/)).toBeInTheDocument();
    });

    it('should show BANKRUPT status with red indicator', () => {
      const agent = createMockAgent({ status: 'bankrupt' });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText(/BANKRUPT/)).toBeInTheDocument();
      expect(screen.getByText(/✗/)).toBeInTheDocument();
    });

    it('should show IMPRISONED status with yellow indicator', () => {
      const agent = createMockAgent({ status: 'imprisoned' });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText(/IMPRISONED/)).toBeInTheDocument();
      expect(screen.getByText(/◉/)).toBeInTheDocument();
    });

    it('should show FLED status with dim indicator', () => {
      const agent = createMockAgent({ status: 'fled' });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText(/FLED/)).toBeInTheDocument();
      expect(screen.getByText(/◎/)).toBeInTheDocument();
    });
  });

  describe('net worth formatting', () => {
    it('should format net worth in billions', () => {
      const agent = createMockAgent({ netWorth: 2500000000 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('$2.50B')).toBeInTheDocument();
    });

    it('should format net worth in millions', () => {
      const agent = createMockAgent({ netWorth: 15000000 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('$15.00M')).toBeInTheDocument();
    });

    it('should format net worth in thousands', () => {
      const agent = createMockAgent({ netWorth: 750000 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('$750.00K')).toBeInTheDocument();
    });

    it('should format small net worth with dollar sign', () => {
      const agent = createMockAgent({ netWorth: 500 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('$500')).toBeInTheDocument();
    });
  });

  describe('24h change display', () => {
    it('should display positive change with plus sign', () => {
      const agent = createMockAgent({ change24h: 7.25 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('+7.25%')).toBeInTheDocument();
    });

    it('should display negative change', () => {
      const agent = createMockAgent({ change24h: -3.5 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('-3.50%')).toBeInTheDocument();
    });

    it('should apply green styling for positive change', () => {
      const agent = createMockAgent({ change24h: 5 });

      render(<AgentCard agent={agent} />);

      const changeElement = screen.getByText('+5.00%');
      expect(changeElement).toHaveClass('text-terminal-highlight');
    });

    it('should apply red styling for negative change', () => {
      const agent = createMockAgent({ change24h: -5 });

      render(<AgentCard agent={agent} />);

      const changeElement = screen.getByText('-5.00%');
      expect(changeElement).toHaveClass('text-terminal-red');
    });

    it('should display zero change with plus sign', () => {
      const agent = createMockAgent({ change24h: 0 });

      render(<AgentCard agent={agent} />);

      expect(screen.getByText('+0.00%')).toBeInTheDocument();
    });
  });

  describe('isYou indicator', () => {
    it('should not show [YOU] indicator by default', () => {
      const agent = createMockAgent();

      render(<AgentCard agent={agent} />);

      expect(screen.queryByText('[YOU]')).not.toBeInTheDocument();
    });

    it('should show [YOU] indicator when isYou is true', () => {
      const agent = createMockAgent();

      render(<AgentCard agent={agent} isYou={true} />);

      expect(screen.getByText('[YOU]')).toBeInTheDocument();
    });

    it('should apply blue border when isYou is true', () => {
      const agent = createMockAgent();

      const { container } = render(<AgentCard agent={agent} isYou={true} />);

      const card = container.firstChild;
      expect(card).toHaveClass('border-terminal-blue');
    });

    it('should apply dim border when isYou is false', () => {
      const agent = createMockAgent();

      const { container } = render(<AgentCard agent={agent} isYou={false} />);

      const card = container.firstChild;
      expect(card).toHaveClass('border-terminal-dim');
    });
  });

  describe('styling', () => {
    it('should have terminal border styling', () => {
      const agent = createMockAgent();

      const { container } = render(<AgentCard agent={agent} />);

      const card = container.firstChild;
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('p-3');
    });

    it('should highlight rank number', () => {
      const agent = createMockAgent({ rank: 5 });

      render(<AgentCard agent={agent} />);

      const rankElement = screen.getByText('#5');
      expect(rankElement).toHaveClass('text-terminal-highlight');
    });
  });
});
