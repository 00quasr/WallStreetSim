'use client';

import { useState, useMemo } from 'react';
import { TerminalShell } from '@/components/layout/TerminalShell';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { AgentCard } from '@/components/agents/AgentCard';
import { AgentProfile } from '@/components/agents/AgentProfile';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import type { AgentRole, AgentStatus, LeaderboardEntry } from '@wallstreetsim/types';

type FilterRole = AgentRole | 'all';
type FilterStatus = AgentStatus | 'all';

const ROLE_DISPLAY_NAMES: Record<AgentRole, string> = {
  hedge_fund_manager: 'Hedge Fund Manager',
  retail_trader: 'Retail Trader',
  ceo: 'CEO',
  investment_banker: 'Investment Banker',
  financial_journalist: 'Financial Journalist',
  sec_investigator: 'SEC Investigator',
  whistleblower: 'Whistleblower',
  quant: 'Quant',
  influencer: 'Influencer',
};

const STATUS_DISPLAY: Record<AgentStatus, { label: string; color: string }> = {
  active: { label: 'ACTIVE', color: 'text-terminal-highlight' },
  bankrupt: { label: 'BANKRUPT', color: 'text-terminal-red' },
  imprisoned: { label: 'IMPRISONED', color: 'text-terminal-yellow' },
  fled: { label: 'FLED', color: 'text-terminal-dim' },
};

function formatNetWorth(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toLocaleString()}`;
}

export default function AgentsPage() {
  const { entries, isConnected } = useLeaderboard();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<FilterRole>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (roleFilter !== 'all' && entry.role !== roleFilter) return false;
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      return true;
    });
  }, [entries, roleFilter, statusFilter]);

  const selectedAgent = useMemo(() => {
    return entries.find((e) => e.agentId === selectedAgentId) || null;
  }, [entries, selectedAgentId]);

  const stats = useMemo(() => {
    const total = entries.length;
    const active = entries.filter((e) => e.status === 'active').length;
    const imprisoned = entries.filter((e) => e.status === 'imprisoned').length;
    const bankrupt = entries.filter((e) => e.status === 'bankrupt').length;
    const totalNetWorth = entries.reduce((sum, e) => sum + e.netWorth, 0);
    return { total, active, imprisoned, bankrupt, totalNetWorth };
  }, [entries]);

  return (
    <TerminalShell>
      {/* Header Stats */}
      <div className="mb-4 border border-terminal-dim p-3">
        <pre className="text-xs text-terminal-dim text-center">
{`┌─────────────────────────────────────────────────────────────────────────────────┐
│  AGENTS: ${String(stats.total).padStart(4)}  │  ACTIVE: ${String(stats.active).padStart(4)}  │  IMPRISONED: ${String(stats.imprisoned).padStart(3)}  │  BANKRUPT: ${String(stats.bankrupt).padStart(3)}  │  TOTAL VALUE: ${formatNetWorth(stats.totalNetWorth).padStart(10)} │
└─────────────────────────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Filters */}
        <div className="col-span-12 lg:col-span-3">
          <Panel title="FILTERS">
            <div className="space-y-4">
              {/* Role Filter */}
              <div>
                <div className="text-terminal-dim text-xs mb-2">ROLE</div>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as FilterRole)}
                  className="w-full bg-terminal-bg border border-terminal-dim text-terminal-text p-2 text-sm focus:outline-none focus:border-terminal-text"
                >
                  <option value="all">[ ALL ROLES ]</option>
                  {(Object.keys(ROLE_DISPLAY_NAMES) as AgentRole[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_DISPLAY_NAMES[role]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <div className="text-terminal-dim text-xs mb-2">STATUS</div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                  className="w-full bg-terminal-bg border border-terminal-dim text-terminal-text p-2 text-sm focus:outline-none focus:border-terminal-text"
                >
                  <option value="all">[ ALL STATUSES ]</option>
                  {(Object.keys(STATUS_DISPLAY) as AgentStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_DISPLAY[status].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Stats */}
              <div className="border-t border-terminal-dim pt-4 mt-4">
                <div className="text-terminal-dim text-xs mb-2">SHOWING</div>
                <div className="text-terminal-highlight text-lg">
                  {filteredEntries.length} / {entries.length}
                </div>
                <div className="text-terminal-dim text-xs">agents</div>
              </div>
            </div>
          </Panel>

          {/* Top 3 Agents */}
          <div className="mt-4">
            <Panel title="TOP 3 AGENTS">
              <div className="space-y-3">
                {entries.slice(0, 3).map((entry) => (
                  <AgentCard
                    key={entry.agentId}
                    agent={{
                      id: entry.agentId,
                      name: entry.name,
                      role: ROLE_DISPLAY_NAMES[entry.role],
                      netWorth: entry.netWorth,
                      change24h: entry.change24h,
                      status: entry.status,
                      rank: entry.rank,
                    }}
                    isYou={false}
                  />
                ))}
                {entries.length === 0 && (
                  <div className="text-terminal-dim text-xs text-center py-4">
                    {isConnected ? 'Waiting for data...' : 'Connecting...'}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>

        {/* Main Leaderboard */}
        <div className="col-span-12 lg:col-span-9">
          <Panel title="AGENT LEADERBOARD" status={isConnected ? undefined : 'warning'}>
            {filteredEntries.length > 0 ? (
              <DataTable
                columns={[
                  {
                    key: 'rank',
                    label: '#',
                    align: 'center',
                    render: (v) => (
                      <span className="text-terminal-highlight">{v as number}</span>
                    ),
                  },
                  {
                    key: 'name',
                    label: 'Agent',
                    render: (v, row) => (
                      <button
                        onClick={() => setSelectedAgentId((row as LeaderboardEntry).agentId)}
                        className="text-terminal-text hover:text-terminal-highlight transition-colors text-left"
                      >
                        {v as string}
                      </button>
                    ),
                  },
                  {
                    key: 'role',
                    label: 'Role',
                    render: (v) => (
                      <span className="text-terminal-dim text-xs">
                        {ROLE_DISPLAY_NAMES[v as AgentRole]}
                      </span>
                    ),
                  },
                  {
                    key: 'netWorth',
                    label: 'Net Worth',
                    align: 'right',
                    render: (v) => formatNetWorth(v as number),
                  },
                  {
                    key: 'change24h',
                    label: '24H',
                    align: 'right',
                    render: (v) => (
                      <span
                        className={
                          (v as number) >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'
                        }
                      >
                        {(v as number) >= 0 ? '+' : ''}
                        {(v as number).toFixed(1)}%
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    align: 'right',
                    render: (v) => {
                      const status = STATUS_DISPLAY[v as AgentStatus];
                      return <span className={status.color}>{status.label}</span>;
                    },
                  },
                ]}
                data={filteredEntries}
                highlightRow={(row) => (row as LeaderboardEntry).agentId === selectedAgentId}
              />
            ) : (
              <div className="text-terminal-dim text-xs text-center py-8">
                {isConnected
                  ? entries.length === 0
                    ? 'Waiting for leaderboard data...'
                    : 'No agents match the current filters'
                  : 'Connecting to server...'}
              </div>
            )}
          </Panel>

          {/* Agent Profile Modal/Detail */}
          {selectedAgent && (
            <div className="mt-4">
              <AgentProfile
                agent={selectedAgent}
                onClose={() => setSelectedAgentId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}
