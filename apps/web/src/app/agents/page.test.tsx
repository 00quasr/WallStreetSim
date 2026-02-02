import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentsPage from './page';
import type { LeaderboardEntry } from '@wallstreetsim/types';

// Mock the components
vi.mock('@/components/layout/TerminalShell', () => ({
  TerminalShell: ({ children }: { children: React.ReactNode }) => <div data-testid="terminal-shell">{children}</div>,
}));

vi.mock('@/components/ui/Panel', () => ({
  Panel: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="panel" data-title={title}>{children}</div>
  ),
}));

vi.mock('@/components/ui/DataTable', () => ({
  DataTable: ({ data, columns }: { data: unknown[]; columns: unknown[] }) => (
    <div data-testid="data-table" data-row-count={data.length} data-column-count={columns.length}>
      {data.map((row, i) => (
        <div key={i} data-testid={`table-row-${i}`}>
          {(row as { name: string }).name}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/agents/AgentCard', () => ({
  AgentCard: ({ agent }: { agent: { name: string } }) => (
    <div data-testid="agent-card">{agent.name}</div>
  ),
}));

vi.mock('@/components/agents/AgentProfile', () => ({
  AgentProfile: ({ agent, onClose }: { agent: { name: string }; onClose: () => void }) => (
    <div data-testid="agent-profile">
      <span>{agent.name}</span>
      <button onClick={onClose} data-testid="close-profile">Close</button>
    </div>
  ),
}));

// Mock useLeaderboard hook
const mockUseLeaderboard = vi.fn();
vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => mockUseLeaderboard(),
}));

const createMockEntry = (overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank: 1,
  agentId: 'agent-1',
  name: 'TestAgent',
  role: 'hedge_fund_manager',
  netWorth: 1000000,
  change24h: 5.5,
  status: 'active',
  ...overrides,
});

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the terminal shell', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: true,
      });

      render(<AgentsPage />);

      expect(screen.getByTestId('terminal-shell')).toBeInTheDocument();
    });

    it('should render header stats section', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: true,
      });

      render(<AgentsPage />);

      expect(screen.getByText(/AGENTS:/)).toBeInTheDocument();
      expect(screen.getByText(/ACTIVE:/)).toBeInTheDocument();
      expect(screen.getByText(/IMPRISONED:/)).toBeInTheDocument();
      expect(screen.getByText(/BANKRUPT:/)).toBeInTheDocument();
    });

    it('should render filter panel', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: true,
      });

      render(<AgentsPage />);

      const panels = screen.getAllByTestId('panel');
      const filterPanel = panels.find(p => p.getAttribute('data-title') === 'FILTERS');
      expect(filterPanel).toBeInTheDocument();
      expect(screen.getByText('ROLE')).toBeInTheDocument();
      expect(screen.getByText('STATUS')).toBeInTheDocument();
    });

    it('should render leaderboard panel', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [createMockEntry()],
        isConnected: true,
      });

      render(<AgentsPage />);

      const panels = screen.getAllByTestId('panel');
      const leaderboardPanel = panels.find(p => p.getAttribute('data-title') === 'AGENT LEADERBOARD');
      expect(leaderboardPanel).toBeInTheDocument();
    });
  });

  describe('loading states', () => {
    it('should show connecting message when not connected', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: false,
      });

      render(<AgentsPage />);

      expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
    });

    it('should show waiting message when connected but no data', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: true,
      });

      render(<AgentsPage />);

      expect(screen.getByText('Waiting for leaderboard data...')).toBeInTheDocument();
    });
  });

  describe('leaderboard data', () => {
    it('should render agents in the data table', () => {
      const entries = [
        createMockEntry({ rank: 1, agentId: 'agent-1', name: 'Alpha' }),
        createMockEntry({ rank: 2, agentId: 'agent-2', name: 'Beta' }),
        createMockEntry({ rank: 3, agentId: 'agent-3', name: 'Gamma' }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      const dataTable = screen.getByTestId('data-table');
      expect(dataTable).toHaveAttribute('data-row-count', '3');
    });

    it('should render top 3 agents in AgentCard components', () => {
      const entries = [
        createMockEntry({ rank: 1, agentId: 'agent-1', name: 'Alpha' }),
        createMockEntry({ rank: 2, agentId: 'agent-2', name: 'Beta' }),
        createMockEntry({ rank: 3, agentId: 'agent-3', name: 'Gamma' }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      const agentCards = screen.getAllByTestId('agent-card');
      expect(agentCards).toHaveLength(3);
    });
  });

  describe('stats calculation', () => {
    it('should calculate correct stats from entries', () => {
      const entries = [
        createMockEntry({ status: 'active', netWorth: 1000000 }),
        createMockEntry({ agentId: 'agent-2', status: 'active', netWorth: 2000000 }),
        createMockEntry({ agentId: 'agent-3', status: 'imprisoned', netWorth: 500000 }),
        createMockEntry({ agentId: 'agent-4', status: 'bankrupt', netWorth: 0 }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      // Stats should be reflected in the header
      // Total: 4, Active: 2, Imprisoned: 1, Bankrupt: 1
      expect(screen.getByText(/AGENTS:\s+4/)).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('should render role filter dropdown with all options', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: true,
      });

      render(<AgentsPage />);

      const roleSelect = screen.getByDisplayValue('[ ALL ROLES ]');
      expect(roleSelect).toBeInTheDocument();
    });

    it('should render status filter dropdown with all options', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [],
        isConnected: true,
      });

      render(<AgentsPage />);

      const statusSelect = screen.getByDisplayValue('[ ALL STATUSES ]');
      expect(statusSelect).toBeInTheDocument();
    });

    it('should filter entries by role', () => {
      const entries = [
        createMockEntry({ rank: 1, agentId: 'agent-1', name: 'Hedge1', role: 'hedge_fund_manager' }),
        createMockEntry({ rank: 2, agentId: 'agent-2', name: 'Retail1', role: 'retail_trader' }),
        createMockEntry({ rank: 3, agentId: 'agent-3', name: 'Hedge2', role: 'hedge_fund_manager' }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      const roleSelect = screen.getByDisplayValue('[ ALL ROLES ]');
      fireEvent.change(roleSelect, { target: { value: 'retail_trader' } });

      // The data table should now only show filtered entries
      const dataTable = screen.getByTestId('data-table');
      expect(dataTable).toHaveAttribute('data-row-count', '1');
    });

    it('should filter entries by status', () => {
      const entries = [
        createMockEntry({ rank: 1, agentId: 'agent-1', name: 'Active1', status: 'active' }),
        createMockEntry({ rank: 2, agentId: 'agent-2', name: 'Imprisoned1', status: 'imprisoned' }),
        createMockEntry({ rank: 3, agentId: 'agent-3', name: 'Active2', status: 'active' }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      const statusSelect = screen.getByDisplayValue('[ ALL STATUSES ]');
      fireEvent.change(statusSelect, { target: { value: 'imprisoned' } });

      const dataTable = screen.getByTestId('data-table');
      expect(dataTable).toHaveAttribute('data-row-count', '1');
    });

    it('should show no matches message when filter returns empty', () => {
      const entries = [
        createMockEntry({ rank: 1, agentId: 'agent-1', status: 'active' }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      const statusSelect = screen.getByDisplayValue('[ ALL STATUSES ]');
      fireEvent.change(statusSelect, { target: { value: 'bankrupt' } });

      expect(screen.getByText('No agents match the current filters')).toBeInTheDocument();
    });

    it('should update showing count when filtering', () => {
      const entries = [
        createMockEntry({ rank: 1, agentId: 'agent-1', role: 'hedge_fund_manager' }),
        createMockEntry({ rank: 2, agentId: 'agent-2', role: 'retail_trader' }),
        createMockEntry({ rank: 3, agentId: 'agent-3', role: 'hedge_fund_manager' }),
      ];

      mockUseLeaderboard.mockReturnValue({
        entries,
        isConnected: true,
      });

      render(<AgentsPage />);

      // Initially showing all
      expect(screen.getByText('3 / 3')).toBeInTheDocument();

      // Filter by role
      const roleSelect = screen.getByDisplayValue('[ ALL ROLES ]');
      fireEvent.change(roleSelect, { target: { value: 'retail_trader' } });

      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });
  });

  describe('agent profile', () => {
    it('should not show profile by default', () => {
      mockUseLeaderboard.mockReturnValue({
        entries: [createMockEntry()],
        isConnected: true,
      });

      render(<AgentsPage />);

      expect(screen.queryByTestId('agent-profile')).not.toBeInTheDocument();
    });
  });
});
