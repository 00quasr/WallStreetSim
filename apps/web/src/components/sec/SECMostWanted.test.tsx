import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SECMostWanted } from './SECMostWanted';
import type { MostWantedEntry, UseInvestigationsReturn } from '@/hooks/useInvestigations';

// Mock the useInvestigations hook
const mockUseInvestigations = vi.fn<[], UseInvestigationsReturn>();

vi.mock('@/hooks/useInvestigations', () => ({
  useInvestigations: () => mockUseInvestigations(),
}));

function createMockEntry(overrides: Partial<MostWantedEntry> = {}): MostWantedEntry {
  return {
    id: 'inv-1',
    agentId: 'agent-1',
    agentName: 'TestAgent',
    crimeType: 'insider_trading',
    status: 'charged',
    tickOpened: 10000,
    tickCharged: 10500,
    fineAmount: 1000000,
    createdAt: new Date(),
    ...overrides,
  };
}

const defaultMockReturn: UseInvestigationsReturn = {
  mostWanted: [],
  prison: { prisoners: [], totalCount: 0 },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};

describe('SECMostWanted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInvestigations.mockReturnValue(defaultMockReturn);
  });

  describe('loading state', () => {
    it('should show loading message when loading', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        isLoading: true,
      });

      render(<SECMostWanted />);

      expect(screen.getByText('Loading investigations...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when there is an error', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        error: 'Network error',
      });

      render(<SECMostWanted />);

      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty message when no investigations', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        mostWanted: [],
      });

      render(<SECMostWanted />);

      expect(screen.getByText('No active investigations')).toBeInTheDocument();
    });
  });

  describe('with data', () => {
    it('should render investigation entries', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        mostWanted: [
          createMockEntry({ agentName: 'ShadowTrader', crimeType: 'insider_trading' }),
          createMockEntry({ agentName: 'PumpKing', crimeType: 'market_manipulation' }),
        ],
      });

      render(<SECMostWanted />);

      expect(screen.getByText(/ShadowTrader/)).toBeInTheDocument();
      expect(screen.getByText('Insider Trading')).toBeInTheDocument();
      expect(screen.getByText(/PumpKing/)).toBeInTheDocument();
      expect(screen.getByText('Market Manipulation')).toBeInTheDocument();
    });

    it('should format crime types correctly', () => {
      const crimeTypes = [
        { crimeType: 'insider_trading', expected: 'Insider Trading' },
        { crimeType: 'market_manipulation', expected: 'Market Manipulation' },
        { crimeType: 'pump_and_dump', expected: 'Pump & Dump' },
        { crimeType: 'wash_trading', expected: 'Wash Trading' },
        { crimeType: 'spoofing', expected: 'Spoofing' },
        { crimeType: 'bribery', expected: 'Bribery' },
        { crimeType: 'tax_evasion', expected: 'Tax Evasion' },
        { crimeType: 'accounting_fraud', expected: 'Accounting Fraud' },
        { crimeType: 'obstruction', expected: 'Obstruction' },
        { crimeType: 'coordination', expected: 'Coordination' },
      ] as const;

      for (const { crimeType, expected } of crimeTypes) {
        mockUseInvestigations.mockReturnValue({
          ...defaultMockReturn,
          mostWanted: [createMockEntry({ crimeType, agentName: `Agent_${crimeType}` })],
        });

        const { unmount } = render(<SECMostWanted />);
        expect(screen.getByText(expected)).toBeInTheDocument();
        unmount();
      }
    });

    it('should show appropriate status indicators', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        mostWanted: [
          createMockEntry({ agentName: 'Agent1', status: 'open' }),
          createMockEntry({ agentName: 'Agent2', status: 'charged' }),
          createMockEntry({ agentName: 'Agent3', status: 'trial' }),
        ],
      });

      render(<SECMostWanted />);

      // Check that all agents are rendered
      expect(screen.getByText(/Agent1/)).toBeInTheDocument();
      expect(screen.getByText(/Agent2/)).toBeInTheDocument();
      expect(screen.getByText(/Agent3/)).toBeInTheDocument();
    });

    it('should handle unknown crime types gracefully', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        mostWanted: [createMockEntry({ crimeType: 'unknown_crime' as MostWantedEntry['crimeType'] })],
      });

      render(<SECMostWanted />);

      // Should format unknown_crime as "Unknown Crime"
      expect(screen.getByText('Unknown Crime')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply terminal red styling to agent names', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        mostWanted: [createMockEntry({ agentName: 'CriminalAgent' })],
      });

      const { container } = render(<SECMostWanted />);

      const agentSpan = container.querySelector('.text-terminal-red');
      expect(agentSpan).toBeInTheDocument();
      expect(agentSpan?.textContent).toContain('CriminalAgent');
    });

    it('should apply terminal dim styling to crime types', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        mostWanted: [createMockEntry({ crimeType: 'bribery' })],
      });

      const { container } = render(<SECMostWanted />);

      const crimeSpan = container.querySelector('.text-terminal-dim');
      expect(crimeSpan).toBeInTheDocument();
      expect(crimeSpan?.textContent).toBe('Bribery');
    });
  });
});
