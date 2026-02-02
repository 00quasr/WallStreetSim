'use client';

import { Panel } from '../ui/Panel';
import { ProgressBar } from '../ui/ProgressBar';
import type { LeaderboardEntry, AgentRole, AgentStatus } from '@wallstreetsim/types';

interface AgentProfileProps {
  agent: LeaderboardEntry;
  onClose: () => void;
}

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

const ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
  hedge_fund_manager: 'Manages large pools of capital with advanced trading strategies',
  retail_trader: 'Individual trader with limited capital but high risk tolerance',
  ceo: 'Corporate executive with insider knowledge and company influence',
  investment_banker: 'Facilitates deals and has access to exclusive offerings',
  financial_journalist: 'Can influence markets through media and news coverage',
  sec_investigator: 'Enforces regulations and investigates market manipulation',
  whistleblower: 'Exposes fraud and corruption for rewards',
  quant: 'Uses mathematical models and algorithms for trading',
  influencer: 'Moves markets through social media and public opinion',
};

const STATUS_CONFIG: Record<AgentStatus, { icon: string; label: string; color: string }> = {
  active: { icon: '●', label: 'ACTIVE', color: 'text-terminal-highlight' },
  bankrupt: { icon: '✗', label: 'BANKRUPT', color: 'text-terminal-red' },
  imprisoned: { icon: '◉', label: 'IMPRISONED', color: 'text-terminal-yellow' },
  fled: { icon: '◎', label: 'FLED', color: 'text-terminal-dim' },
};

function formatNetWorth(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toLocaleString()}`;
}

export function AgentProfile({ agent, onClose }: AgentProfileProps) {
  const status = STATUS_CONFIG[agent.status];

  return (
    <Panel title={`AGENT PROFILE: ${agent.name.toUpperCase()}`}>
      <div className="relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-0 right-0 text-terminal-dim hover:text-terminal-red transition-colors"
          aria-label="Close profile"
        >
          [X]
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Basic Info */}
          <div className="space-y-4">
            {/* Agent Header */}
            <div className="border border-terminal-dim p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-terminal-highlight text-lg">{agent.name}</div>
                  <div className="text-terminal-dim text-xs">
                    {ROLE_DISPLAY_NAMES[agent.role]}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-terminal-highlight text-2xl">#{agent.rank}</div>
                  <div className="text-terminal-dim text-xs">RANK</div>
                </div>
              </div>

              <div className={`text-sm ${status.color}`}>
                {status.icon} {status.label}
              </div>
            </div>

            {/* Role Description */}
            <div>
              <div className="text-terminal-dim text-xs mb-2">ROLE DESCRIPTION</div>
              <div className="text-terminal-text text-sm border border-terminal-dim p-3">
                {ROLE_DESCRIPTIONS[agent.role]}
              </div>
            </div>

            {/* Agent ID */}
            <div>
              <div className="text-terminal-dim text-xs mb-1">AGENT ID</div>
              <div className="text-terminal-text text-xs font-mono bg-terminal-bg border border-terminal-dim p-2 break-all">
                {agent.agentId}
              </div>
            </div>
          </div>

          {/* Right Column - Financial Info */}
          <div className="space-y-4">
            {/* Net Worth */}
            <div className="border border-terminal-dim p-4">
              <div className="text-terminal-dim text-xs mb-1">NET WORTH</div>
              <div className="text-terminal-highlight text-3xl">
                {formatNetWorth(agent.netWorth)}
              </div>
              <div
                className={`text-sm mt-1 ${
                  agent.change24h >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'
                }`}
              >
                {agent.change24h >= 0 ? '▲' : '▼'} {Math.abs(agent.change24h).toFixed(2)}% (24h)
              </div>
            </div>

            {/* Performance Indicator */}
            <div>
              <div className="text-terminal-dim text-xs mb-2">24H PERFORMANCE</div>
              <ProgressBar
                value={Math.min(100, Math.max(0, 50 + agent.change24h * 2))}
                label={agent.change24h >= 0 ? 'GAINS' : 'LOSSES'}
              />
            </div>

            {/* Quick Stats */}
            <div className="border border-terminal-dim p-3">
              <div className="text-terminal-dim text-xs mb-3">QUICK STATS</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-terminal-dim">Rank Position</span>
                  <span className="text-terminal-text">#{agent.rank}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-dim">24H Change</span>
                  <span
                    className={
                      agent.change24h >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'
                    }
                  >
                    {agent.change24h >= 0 ? '+' : ''}{agent.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-terminal-dim">Status</span>
                  <span className={status.color}>{status.label}</span>
                </div>
              </div>
            </div>

            {/* ASCII Art decoration based on status */}
            <div className="text-terminal-dim text-xs text-center">
              {agent.status === 'active' && (
                <pre>{`
  ┌─────────────┐
  │  TRADING    │
  │   ACTIVE    │
  └─────────────┘
                `}</pre>
              )}
              {agent.status === 'imprisoned' && (
                <pre>{`
  ┌─────────────┐
  │  ▓▓▓▓▓▓▓▓▓  │
  │  IN PRISON  │
  └─────────────┘
                `}</pre>
              )}
              {agent.status === 'bankrupt' && (
                <pre>{`
  ┌─────────────┐
  │    $0.00    │
  │  BANKRUPT   │
  └─────────────┘
                `}</pre>
              )}
              {agent.status === 'fled' && (
                <pre>{`
  ┌─────────────┐
  │   >>> >>>   │
  │    FLED     │
  └─────────────┘
                `}</pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
