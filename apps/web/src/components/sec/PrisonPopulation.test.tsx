import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrisonPopulation } from './PrisonPopulation';
import type { PrisonEntry, UseInvestigationsReturn } from '@/hooks/useInvestigations';

// Mock the useInvestigations hook
const mockUseInvestigations = vi.fn<[], UseInvestigationsReturn>();

vi.mock('@/hooks/useInvestigations', () => ({
  useInvestigations: () => mockUseInvestigations(),
}));

function createMockPrisoner(overrides: Partial<PrisonEntry> = {}): PrisonEntry {
  return {
    agentId: 'agent-1',
    agentName: 'TestPrisoner',
    imprisonedUntilTick: 160000,
    crimeType: 'accounting_fraud',
    sentenceYears: 25,
    fineAmount: 1000000,
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

describe('PrisonPopulation', () => {
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

      render(<PrisonPopulation />);

      expect(screen.getByText('Loading prison data...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when there is an error', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        error: 'Database error',
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('Error: Database error')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty message when no prisoners', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: { prisoners: [], totalCount: 0 },
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('No inmates currently')).toBeInTheDocument();
      expect(screen.getByText('Total inmates:')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('with data', () => {
    it('should render prisoner entries', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [
            createMockPrisoner({ agentName: 'BernieBot', sentenceYears: 150 }),
            createMockPrisoner({ agentName: 'InsiderIvan', sentenceYears: 10 }),
          ],
          totalCount: 23,
        },
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('BernieBot')).toBeInTheDocument();
      expect(screen.getByText('150 years')).toBeInTheDocument();
      expect(screen.getByText('InsiderIvan')).toBeInTheDocument();
      expect(screen.getByText('10 years')).toBeInTheDocument();
      expect(screen.getByText('23')).toBeInTheDocument();
    });

    it('should format sentence correctly for 1 year', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [createMockPrisoner({ agentName: 'ShortTimer', sentenceYears: 1 })],
          totalCount: 1,
        },
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('1 year')).toBeInTheDocument();
    });

    it('should handle null sentence years', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [createMockPrisoner({ agentName: 'Mystery', sentenceYears: null })],
          totalCount: 1,
        },
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('should show total count', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [createMockPrisoner()],
          totalCount: 42,
        },
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('Total inmates:')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should show correct total count even when showing limited prisoners', () => {
      // When prisonLimit is 5, we show 5 prisoners but total might be higher
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [
            createMockPrisoner({ agentName: 'Prisoner1' }),
            createMockPrisoner({ agentName: 'Prisoner2' }),
          ],
          totalCount: 100,
        },
      });

      render(<PrisonPopulation />);

      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should apply terminal dim styling to agent names', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [createMockPrisoner({ agentName: 'Convict' })],
          totalCount: 1,
        },
      });

      const { container } = render(<PrisonPopulation />);

      const nameSpans = container.querySelectorAll('.text-terminal-dim');
      const convictSpan = Array.from(nameSpans).find(span => span.textContent === 'Convict');
      expect(convictSpan).toBeInTheDocument();
    });

    it('should have border separator before total count', () => {
      mockUseInvestigations.mockReturnValue({
        ...defaultMockReturn,
        prison: {
          prisoners: [createMockPrisoner()],
          totalCount: 5,
        },
      });

      const { container } = render(<PrisonPopulation />);

      const borderDiv = container.querySelector('.border-t.border-terminal-dim');
      expect(borderDiv).toBeInTheDocument();
    });
  });
});
