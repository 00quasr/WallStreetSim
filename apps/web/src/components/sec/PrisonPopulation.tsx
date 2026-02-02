'use client';

import { useInvestigations } from '@/hooks/useInvestigations';

function formatSentence(sentenceYears: number | null): string {
  if (sentenceYears === null) return 'Unknown';
  if (sentenceYears >= 100) return `${sentenceYears} years`;
  if (sentenceYears === 1) return '1 year';
  return `${sentenceYears} years`;
}

export function PrisonPopulation() {
  const { prison, isLoading, error } = useInvestigations({ prisonLimit: 5 });

  if (isLoading) {
    return (
      <div className="text-terminal-dim text-xs text-center py-4">
        Loading prison data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-terminal-red text-xs text-center py-4">
        Error: {error}
      </div>
    );
  }

  if (prison.prisoners.length === 0) {
    return (
      <div className="space-y-2 text-xs">
        <div className="text-terminal-dim text-center py-2">
          No inmates currently
        </div>
        <div className="pt-2 border-t border-terminal-dim mt-2">
          <span className="text-terminal-dim">Total inmates: </span>
          <span className="text-terminal-text">0</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {prison.prisoners.map((prisoner) => (
        <div key={prisoner.agentId} className="flex justify-between">
          <span className="text-terminal-dim">{prisoner.agentName}</span>
          <span>{formatSentence(prisoner.sentenceYears)}</span>
        </div>
      ))}
      <div className="pt-2 border-t border-terminal-dim mt-2">
        <span className="text-terminal-dim">Total inmates: </span>
        <span className="text-terminal-text">{prison.totalCount}</span>
      </div>
    </div>
  );
}
