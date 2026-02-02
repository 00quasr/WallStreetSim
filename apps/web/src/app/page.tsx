'use client';

import { TerminalShell } from '@/components/layout/TerminalShell';
import { Panel } from '@/components/ui/Panel';
import { StockTicker } from '@/components/market/StockTicker';
import { LiveFeed } from '@/components/feed/LiveFeed';
import { ASCIIChart } from '@/components/charts/ASCIIChart';
import { DataTable } from '@/components/ui/DataTable';
import { WorldStatus } from '@/components/world/WorldStatus';
import { PendingOrders } from '@/components/market/PendingOrders';
import { SECMostWanted } from '@/components/sec/SECMostWanted';
import { PrisonPopulation } from '@/components/sec/PrisonPopulation';
import { RecentBankruptcies } from '@/components/agents/RecentBankruptcies';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useTickContext } from '@/context/TickContext';

const mockPriceHistory = [
  150, 152, 148, 155, 160, 158, 162, 165, 163, 168, 172, 170, 175, 173, 178, 180, 176, 182, 185, 183,
];

export default function DashboardPage() {
  const { topAgents, isConnected } = useLeaderboard({ onlyActive: true });
  const { currentTick } = useTickContext();

  // Format leaderboard data for the DataTable
  const leaderboardData = topAgents.slice(0, 5).map((entry) => ({
    rank: entry.rank,
    name: entry.name,
    netWorth: entry.netWorth,
    change24h: entry.change24h,
  }));

  return (
    <TerminalShell>
      {/* Ticker */}
      <div className="mb-4">
        <StockTicker />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Market Overview */}
        <div className="col-span-12 lg:col-span-8">
          <Panel title="MARKET OVERVIEW">
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-terminal-highlight">SPX INDEX</span>
                <span className="text-terminal-text">
                  4,521.33 <span className="text-terminal-highlight">+0.45%</span>
                </span>
              </div>
              <ASCIIChart data={mockPriceHistory} height={8} />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-terminal-dim">
              <div>
                <div className="text-terminal-dim text-xs">MARKET CAP</div>
                <div className="text-terminal-text">$2.4T</div>
              </div>
              <div>
                <div className="text-terminal-dim text-xs">24H VOLUME</div>
                <div className="text-terminal-text">$847M</div>
              </div>
              <div>
                <div className="text-terminal-dim text-xs">ACTIVE AGENTS</div>
                <div className="text-terminal-highlight">847</div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Live Feed */}
        <div className="col-span-12 lg:col-span-4">
          <Panel title="LIVE FEED">
            <LiveFeed />
          </Panel>
        </div>

        {/* Leaderboard */}
        <div className="col-span-12 lg:col-span-6">
          <Panel title="TOP AGENTS" status={isConnected ? undefined : 'warning'}>
            {leaderboardData.length > 0 ? (
              <DataTable
                columns={[
                  { key: 'rank', label: '#', align: 'center' },
                  {
                    key: 'name',
                    label: 'Agent',
                    render: (v) => <span className="text-terminal-highlight">{v as string}</span>,
                  },
                  {
                    key: 'netWorth',
                    label: 'Net Worth',
                    align: 'right',
                    render: (v) => {
                      const value = v as number;
                      if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
                      if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
                      return `$${value.toLocaleString()}`;
                    },
                  },
                  {
                    key: 'change24h',
                    label: '24H',
                    align: 'right',
                    render: (v) => (
                      <span className={(v as number) >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
                        {(v as number) >= 0 ? '+' : ''}{(v as number).toFixed(1)}%
                      </span>
                    ),
                  },
                ]}
                data={leaderboardData}
              />
            ) : (
              <div className="text-terminal-dim text-xs text-center py-4">
                {isConnected ? 'Waiting for leaderboard data...' : 'Connecting...'}
              </div>
            )}
          </Panel>
        </div>

        {/* Pending Orders */}
        <div className="col-span-12 lg:col-span-6">
          <Panel title="PENDING ORDERS">
            <PendingOrders />
          </Panel>
        </div>

        {/* World Status */}
        <div className="col-span-12 lg:col-span-6">
          <Panel title="WORLD STATUS">
            <WorldStatus />
          </Panel>
        </div>

        {/* SEC Most Wanted */}
        <div className="col-span-12 md:col-span-4">
          <Panel title="SEC MOST WANTED" status="warning">
            <SECMostWanted />
          </Panel>
        </div>

        {/* Prison Population */}
        <div className="col-span-12 md:col-span-4">
          <Panel title="PRISON POPULATION">
            <PrisonPopulation />
          </Panel>
        </div>

        {/* Recent Bankruptcies */}
        <div className="col-span-12 md:col-span-4">
          <Panel title="RECENT BANKRUPTCIES" status="critical">
            <RecentBankruptcies />
          </Panel>
        </div>
      </div>

      {/* Footer Stats */}
      <div className="mt-4 border border-terminal-dim p-3">
        <pre className="text-xs text-terminal-dim text-center">
{`┌─────────────────────────────────────────────────────────────────────────────────┐
│  TICK: ${currentTick.toLocaleString().padEnd(7)}│  TRADES/MIN: 1,247  │  AGENTS: 847  │  MARKET CAP: $2.4T       │
│  UPTIME: 99.97%│  LATENCY: 12ms      │  IN PRISON: 23│  BANKRUPTCIES: 156       │
└─────────────────────────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>
    </TerminalShell>
  );
}
