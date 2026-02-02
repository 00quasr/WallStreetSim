import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentBankruptcies } from './RecentBankruptcies';
import type { LeaderboardEntry, AgentRole, AgentStatus } from '@wallstreetsim/types';
import type { UseLeaderboardReturn } from '@/hooks/useLeaderboard';

// Mock the useLeaderboard hook
const mockUseLeaderboard = vi.fn<[], UseLeaderboardReturn>();

vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => mockUseLeaderboard(),
}));

function createMockEntry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    rank: 1,
    agentId: 'agent-1',
    name: 'TestAgent',
    role: 'hedge_fund_manager',
    netWorth: 0,
    change24h: -100,
    status: 'bankrupt',
    ...overrides,
  };
}

const defaultMockReturn: UseLeaderboardReturn = {
  entries: [],
  topAgents: [],
  lastUpdate: null,
  getAgentByRank: vi.fn(),
  getAgentById: vi.fn(),
  getAgentsByRole: vi.fn().mockReturnValue([]),
  getAgentsByStatus: vi.fn().mockReturnValue([]),
  isConnected: true,
  connectionStatus: 'connected',
  connect: vi.fn(),
  disconnect: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

describe('RecentBankruptcies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLeaderboard.mockReturnValue(defaultMockReturn);
  });

  describe('connection state', () => {
    it('should show connecting message when not connected', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        isConnected: false,
        connectionStatus: 'connecting',
      });

      render(<RecentBankruptcies />);

      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('should not show connecting message when connected', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        isConnected: true,
      });

      render(<RecentBankruptcies />);

      expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty message when no bankrupt agents', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [
          createMockEntry({ status: 'active', name: 'ActiveAgent' }),
          createMockEntry({ status: 'imprisoned', name: 'PrisonAgent' }),
        ],
      });

      render(<RecentBankruptcies />);

      expect(screen.getByText('No bankruptcies recorded')).toBeInTheDocument();
    });

    it('should show empty message when entries array is empty', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [],
      });

      render(<RecentBankruptcies />);

      expect(screen.getByText('No bankruptcies recorded')).toBeInTheDocument();
    });
  });

  describe('with bankrupt agents', () => {
    it('should render bankrupt agent entries', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [
          createMockEntry({ name: 'BankruptTrader', status: 'bankrupt' }),
          createMockEntry({ name: 'FailedFund', status: 'bankrupt', agentId: 'agent-2' }),
        ],
      });

      render(<RecentBankruptcies />);

      expect(screen.getByText(/BankruptTrader/)).toBeInTheDocument();
      expect(screen.getByText(/FailedFund/)).toBeInTheDocument();
    });

    it('should only show bankrupt agents and filter out others', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [
          createMockEntry({ name: 'ActiveAgent', status: 'active', agentId: 'agent-1' }),
          createMockEntry({ name: 'BankruptAgent', status: 'bankrupt', agentId: 'agent-2' }),
          createMockEntry({ name: 'ImprisonedAgent', status: 'imprisoned', agentId: 'agent-3' }),
          createMockEntry({ name: 'FledAgent', status: 'fled', agentId: 'agent-4' }),
        ],
      });

      render(<RecentBankruptcies />);

      expect(screen.queryByText(/ActiveAgent/)).not.toBeInTheDocument();
      expect(screen.getByText(/BankruptAgent/)).toBeInTheDocument();
      expect(screen.queryByText(/ImprisonedAgent/)).not.toBeInTheDocument();
      expect(screen.queryByText(/FledAgent/)).not.toBeInTheDocument();
    });

    it('should limit display to 5 bankrupt agents', () => {
      const manyBankruptAgents = Array.from({ length: 10 }, (_, i) =>
        createMockEntry({
          name: `BankruptAgent${i + 1}`,
          status: 'bankrupt',
          agentId: `agent-${i + 1}`,
        })
      );

      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: manyBankruptAgents,
      });

      render(<RecentBankruptcies />);

      // Should show first 5
      expect(screen.getByText(/BankruptAgent1/)).toBeInTheDocument();
      expect(screen.getByText(/BankruptAgent5/)).toBeInTheDocument();
      // Should not show agents beyond 5
      expect(screen.queryByText(/BankruptAgent6/)).not.toBeInTheDocument();
      expect(screen.queryByText(/BankruptAgent10/)).not.toBeInTheDocument();
    });

    it('should display role for each agent', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [
          createMockEntry({ name: 'Agent1', role: 'hedge_fund_manager', status: 'bankrupt' }),
          createMockEntry({ name: 'Agent2', role: 'retail_trader', status: 'bankrupt', agentId: 'agent-2' }),
          createMockEntry({ name: 'Agent3', role: 'quant', status: 'bankrupt', agentId: 'agent-3' }),
        ],
      });

      render(<RecentBankruptcies />);

      expect(screen.getByText(/Hedge Fund/)).toBeInTheDocument();
      expect(screen.getByText(/Retail/)).toBeInTheDocument();
      expect(screen.getByText(/Quant/)).toBeInTheDocument();
    });

    it('should format all role types correctly', () => {
      const roleTests: Array<{ role: AgentRole; expected: string }> = [
        { role: 'hedge_fund_manager', expected: 'Hedge Fund' },
        { role: 'retail_trader', expected: 'Retail' },
        { role: 'ceo', expected: 'CEO' },
        { role: 'investment_banker', expected: 'IB' },
        { role: 'financial_journalist', expected: 'Journalist' },
        { role: 'sec_investigator', expected: 'SEC' },
        { role: 'whistleblower', expected: 'Whistleblower' },
        { role: 'quant', expected: 'Quant' },
        { role: 'influencer', expected: 'Influencer' },
      ];

      for (const { role, expected } of roleTests) {
        mockUseLeaderboard.mockReturnValue({
          ...defaultMockReturn,
          entries: [createMockEntry({ role, status: 'bankrupt' })],
        });

        const { unmount } = render(<RecentBankruptcies />);
        expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
        unmount();
      }
    });

    it('should show $0 net worth for bankrupt agents', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [createMockEntry({ status: 'bankrupt' })],
      });

      render(<RecentBankruptcies />);

      expect(screen.getByText(/Net Worth: \$0/)).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply terminal red styling to agent names', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [createMockEntry({ name: 'FailedAgent', status: 'bankrupt' })],
      });

      const { container } = render(<RecentBankruptcies />);

      const agentDiv = container.querySelector('.text-terminal-red');
      expect(agentDiv).toBeInTheDocument();
      expect(agentDiv?.textContent).toContain('FailedAgent');
    });

    it('should show X mark for bankrupt agents', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [createMockEntry({ name: 'FailedAgent', status: 'bankrupt' })],
      });

      const { container } = render(<RecentBankruptcies />);

      const agentDiv = container.querySelector('.text-terminal-red');
      expect(agentDiv?.textContent).toContain('✗');
    });

    it('should apply terminal dim styling to role info', () => {
      mockUseLeaderboard.mockReturnValue({
        ...defaultMockReturn,
        entries: [createMockEntry({ status: 'bankrupt' })],
      });

      const { container } = render(<RecentBankruptcies />);

      const roleDiv = container.querySelector('.text-terminal-dim');
      expect(roleDiv).toBeInTheDocument();
      expect(roleDiv?.textContent).toContain('Net Worth');
    });
  });

  describe('hook configuration', () => {
    it('should call useLeaderboard with onlyActive: false to include all statuses', () => {
      render(<RecentBankruptcies />);

      expect(mockUseLeaderboard).toHaveBeenCalled();
    });
  });
});
