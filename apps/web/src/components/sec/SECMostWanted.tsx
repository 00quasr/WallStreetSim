'use client';

import { useInvestigations } from '@/hooks/useInvestigations';
import type { CrimeType, InvestigationStatus } from '@wallstreetsim/types';

const CRIME_TYPE_LABELS: Record<CrimeType, string> = {
  insider_trading: 'Insider Trading',
  market_manipulation: 'Market Manipulation',
  spoofing: 'Spoofing',
  wash_trading: 'Wash Trading',
  pump_and_dump: 'Pump & Dump',
  coordination: 'Coordination',
  accounting_fraud: 'Accounting Fraud',
  bribery: 'Bribery',
  tax_evasion: 'Tax Evasion',
  obstruction: 'Obstruction',
};

const STATUS_INDICATORS: Record<InvestigationStatus, string> = {
  open: '○',
  charged: '▲',
  trial: '◉',
  convicted: '●',
  acquitted: '○',
  settled: '◇',
};

function formatCrimeType(crimeType: string): string {
  return CRIME_TYPE_LABELS[crimeType as CrimeType] || crimeType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SECMostWanted() {
  const { mostWanted, isLoading, error } = useInvestigations({ mostWantedLimit: 5 });

  if (isLoading) {
    return (
      <div className="text-terminal-dim text-xs text-center py-4">
        Loading investigations...
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

  if (mostWanted.length === 0) {
    return (
      <div className="text-terminal-dim text-xs text-center py-4">
        No active investigations
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {mostWanted.map((entry) => (
        <div key={entry.id} className="flex justify-between">
          <span className="text-terminal-red">
            {STATUS_INDICATORS[entry.status]} {entry.agentName}
          </span>
          <span className="text-terminal-dim">
            {formatCrimeType(entry.crimeType)}
          </span>
        </div>
      ))}
    </div>
  );
}
