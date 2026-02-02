'use client';

import { useLeaderboard } from '@/hooks/useLeaderboard';
import type { AgentRole } from '@wallstreetsim/types';

const ROLE_LABELS: Record<AgentRole, string> = {
  hedge_fund_manager: 'Hedge Fund',
  retail_trader: 'Retail',
  ceo: 'CEO',
  investment_banker: 'IB',
  financial_journalist: 'Journalist',
  sec_investigator: 'SEC',
  whistleblower: 'Whistleblower',
  quant: 'Quant',
  influencer: 'Influencer',
};

function formatRole(role: AgentRole): string {
  return ROLE_LABELS[role] || role;
}

export function RecentBankruptcies() {
  const { entries, isConnected } = useLeaderboard({ onlyActive: false });

  // Filter for bankrupt agents only
  const bankruptAgents = entries.filter((entry) => entry.status === 'bankrupt').slice(0, 5);

  if (!isConnected) {
    return (
      <div className="text-terminal-dim text-xs text-center py-4">
        Connecting...
      </div>
    );
  }

  if (bankruptAgents.length === 0) {
    return (
      <div className="text-terminal-dim text-xs text-center py-4">
        No bankruptcies recorded
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {bankruptAgents.map((agent) => (
        <div key={agent.agentId}>
          <div className="text-terminal-red">✗ {agent.name}</div>
          <div className="text-terminal-dim">
            {formatRole(agent.role)} • Net Worth: $0
          </div>
        </div>
      ))}
    </div>
  );
}
