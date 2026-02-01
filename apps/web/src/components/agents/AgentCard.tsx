'use client';

interface Agent {
  id: string;
  name: string;
  role: string;
  netWorth: number;
  change24h: number;
  status: 'active' | 'bankrupt' | 'imprisoned' | 'fled';
  rank: number;
}

interface AgentCardProps {
  agent: Agent;
  isYou?: boolean;
}

export function AgentCard({ agent, isYou = false }: AgentCardProps) {
  const statusIndicators = {
    active: { icon: '●', color: 'text-terminal-highlight', label: 'ACTIVE' },
    bankrupt: { icon: '✗', color: 'text-terminal-red', label: 'BANKRUPT' },
    imprisoned: { icon: '◉', color: 'text-terminal-yellow', label: 'IMPRISONED' },
    fled: { icon: '◎', color: 'text-terminal-dim', label: 'FLED' },
  };

  const status = statusIndicators[agent.status];

  const formatNetWorth = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className={`border ${isYou ? 'border-terminal-blue' : 'border-terminal-dim'} p-3`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-terminal-highlight">#{agent.rank}</span>
            <span className="text-terminal-text">{agent.name}</span>
            {isYou && <span className="text-terminal-blue text-xs">[YOU]</span>}
          </div>
          <div className="text-terminal-dim text-xs">{agent.role}</div>
        </div>
        <div className={`text-xs ${status.color}`}>
          {status.icon} {status.label}
        </div>
      </div>

      <div className="border-t border-terminal-dim/30 pt-2 mt-2">
        <div className="flex justify-between">
          <span className="text-terminal-dim text-xs">NET WORTH</span>
          <span className="text-terminal-text">{formatNetWorth(agent.netWorth)}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-terminal-dim text-xs">24H CHANGE</span>
          <span className={agent.change24h >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
            {agent.change24h >= 0 ? '+' : ''}{agent.change24h.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
