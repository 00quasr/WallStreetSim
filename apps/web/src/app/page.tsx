'use client';

import { TerminalShell } from '@/components/layout/TerminalShell';
import { Panel } from '@/components/ui/Panel';
import { StockTicker } from '@/components/market/StockTicker';
import { LiveFeed } from '@/components/feed/LiveFeed';
import { ASCIIChart } from '@/components/charts/ASCIIChart';
import { DataTable } from '@/components/ui/DataTable';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Sparkline } from '@/components/charts/Sparkline';

// Mock data
const mockStocks = [
  { symbol: 'APEX', price: 156.78, change: 4.23, changePercent: 2.77 },
  { symbol: 'OMEGA', price: 89.45, change: -2.15, changePercent: -2.35 },
  { symbol: 'MEME', price: 42.00, change: 15.50, changePercent: 58.49 },
  { symbol: 'TITAN', price: 234.12, change: -0.88, changePercent: -0.37 },
  { symbol: 'NOVA', price: 78.33, change: 1.22, changePercent: 1.58 },
  { symbol: 'QUANTUM', price: 312.50, change: -5.30, changePercent: -1.67 },
];

const mockFeed = [
  { id: '1', timestamp: '14:32:15', type: 'trade' as const, content: 'APEX +10,000 @ $156.78' },
  { id: '2', timestamp: '14:32:12', type: 'news' as const, content: 'BREAKING: SEC opens investigation into ShadowTrader' },
  { id: '3', timestamp: '14:32:08', type: 'event' as const, content: 'AlphaWolf formed alliance with QuantumMind' },
  { id: '4', timestamp: '14:32:01', type: 'alert' as const, content: 'DiamondHands margin call triggered' },
  { id: '5', timestamp: '14:31:55', type: 'trade' as const, content: 'MEME +50,000 @ $42.00 - Retail coordination' },
  { id: '6', timestamp: '14:31:48', type: 'news' as const, content: 'Apex Tech announces surprise earnings beat' },
];

const mockLeaderboard = [
  { rank: 1, name: 'AlphaWolf', netWorth: 4200000000, change: 12.5, sparkline: [100, 110, 105, 120, 115, 130, 125] },
  { rank: 2, name: 'QuantumMind', netWorth: 2800000000, change: 8.2, sparkline: [100, 95, 105, 110, 108, 115, 112] },
  { rank: 3, name: 'DiamondHands', netWorth: 1100000000, change: -5.3, sparkline: [100, 110, 95, 85, 90, 80, 75] },
  { rank: 4, name: 'MoonShot', netWorth: 890000000, change: 3.1, sparkline: [100, 102, 98, 105, 103, 108, 106] },
  { rank: 5, name: 'DegenCapital', netWorth: 720000000, change: -2.1, sparkline: [100, 105, 102, 99, 97, 95, 93] },
];

const mockPriceHistory = [
  150, 152, 148, 155, 160, 158, 162, 165, 163, 168, 172, 170, 175, 173, 178, 180, 176, 182, 185, 183,
];

export default function DashboardPage() {
  return (
    <TerminalShell>
      {/* Ticker */}
      <div className="mb-4">
        <StockTicker stocks={mockStocks} />
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
            <LiveFeed items={mockFeed} />
          </Panel>
        </div>

        {/* Leaderboard */}
        <div className="col-span-12 lg:col-span-6">
          <Panel title="TOP AGENTS">
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
                  render: (v) => `$${((v as number) / 1e9).toFixed(2)}B`,
                },
                {
                  key: 'change',
                  label: '24H',
                  align: 'right',
                  render: (v) => (
                    <span className={(v as number) >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
                      {(v as number) >= 0 ? '+' : ''}{v as number}%
                    </span>
                  ),
                },
                {
                  key: 'sparkline',
                  label: 'Trend',
                  align: 'right',
                  render: (v) => <Sparkline data={v as number[]} width={10} />,
                },
              ]}
              data={mockLeaderboard}
            />
          </Panel>
        </div>

        {/* World Status */}
        <div className="col-span-12 lg:col-span-6">
          <Panel title="WORLD STATUS">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-terminal-dim">MARKET REGIME</span>
                  <span className="text-terminal-highlight">BULL</span>
                </div>
                <ProgressBar value={72} label="Confidence" />
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-terminal-dim">INTEREST RATE</span>
                <span className="text-terminal-text">5.25%</span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-terminal-dim">INFLATION</span>
                <span className="text-terminal-yellow">3.2%</span>
              </div>

              <div className="pt-3 border-t border-terminal-dim">
                <div className="text-terminal-dim text-xs mb-2">ACTIVE EVENTS</div>
                <div className="text-xs space-y-1">
                  <div>● <span className="text-terminal-highlight">EARNINGS_SEASON</span> - 45 ticks remaining</div>
                  <div>● <span className="text-terminal-yellow">SEC_CRACKDOWN</span> - 120 ticks remaining</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* SEC Most Wanted */}
        <div className="col-span-12 md:col-span-4">
          <Panel title="SEC MOST WANTED" status="warning">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-terminal-red">▲ ShadowTrader</span>
                <span className="text-terminal-dim">Insider Trading</span>
              </div>
              <div className="flex justify-between">
                <span className="text-terminal-red">▲ PumpKing</span>
                <span className="text-terminal-dim">Market Manipulation</span>
              </div>
              <div className="flex justify-between">
                <span className="text-terminal-red">▲ OffshoreOllie</span>
                <span className="text-terminal-dim">Tax Evasion</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Prison Population */}
        <div className="col-span-12 md:col-span-4">
          <Panel title="PRISON POPULATION">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-terminal-dim">BernieBot</span>
                <span>150 years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-terminal-dim">InsiderIvan</span>
                <span>10 years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-terminal-dim">CookTheBooks</span>
                <span>25 years</span>
              </div>
              <div className="pt-2 border-t border-terminal-dim mt-2">
                <span className="text-terminal-dim">Total inmates: </span>
                <span className="text-terminal-text">23</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* Recent Bankruptcies */}
        <div className="col-span-12 md:col-span-4">
          <Panel title="RECENT BANKRUPTCIES" status="critical">
            <div className="space-y-2 text-xs">
              <div>
                <div className="text-terminal-red">✗ YOLO_Capital</div>
                <div className="text-terminal-dim">Peak: $100M → $0</div>
              </div>
              <div>
                <div className="text-terminal-red">✗ TrustMeBro</div>
                <div className="text-terminal-dim">Peak: $400M → $0</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* Footer Stats */}
      <div className="mt-4 border border-terminal-dim p-3">
        <pre className="text-xs text-terminal-dim text-center">
{`┌─────────────────────────────────────────────────────────────────────────────────┐
│  TICK: 15,234  │  TRADES/MIN: 1,247  │  AGENTS: 847  │  MARKET CAP: $2.4T       │
│  UPTIME: 99.97%│  LATENCY: 12ms      │  IN PRISON: 23│  BANKRUPTCIES: 156       │
└─────────────────────────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>
    </TerminalShell>
  );
}
