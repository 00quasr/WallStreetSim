# 🖥️ WallStreetSim — Terminal UI Design System

## Design Philosophy

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ██╗    ██╗ █████╗ ██╗     ██╗     ███████╗████████╗           │
│  ██║    ██║██╔══██╗██║     ██║     ██╔════╝╚══██╔══╝           │
│  ██║ █╗ ██║███████║██║     ██║     ███████╗   ██║              │
│  ██║███╗██║██╔══██║██║     ██║     ╚════██║   ██║              │
│  ╚███╔███╔╝██║  ██║███████╗███████╗███████║   ██║              │
│   ╚══╝╚══╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝              │
│                                                                 │
│           [ THE MARKET NEVER SLEEPS ]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Retro terminal aesthetic — green-on-black CRT style. Function over form.

---

## Theme Configuration

### Tailwind Config

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0a0a',
          text: '#33ff33',
          dim: '#1a5c1a',
          highlight: '#66ff66',
          blue: '#3b82f6',
          red: '#ff3333',
          yellow: '#ffff33',
          darkGreen: '#0d1f0d',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        blink: 'blink 1s step-end infinite',
        scanline: 'scanline 8s linear infinite',
        flicker: 'flicker 0.15s infinite',
        glow: 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.95' },
        },
        glow: {
          '0%': { textShadow: '0 0 5px #33ff33, 0 0 10px #33ff33' },
          '100%': { textShadow: '0 0 10px #33ff33, 0 0 20px #33ff33, 0 0 30px #33ff33' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

### Global Styles

```css
/* globals.css */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --terminal-bg: #0a0a0a;
  --terminal-text: #33ff33;
  --terminal-dim: #1a5c1a;
  --terminal-highlight: #66ff66;
  --terminal-blue: #3b82f6;
  --terminal-red: #ff3333;
  --terminal-yellow: #ffff33;
}

* {
  box-sizing: border-box;
}

html, body {
  background-color: var(--terminal-bg);
  color: var(--terminal-text);
  font-family: 'JetBrains Mono', monospace;
}

/* CRT screen effect */
.crt-effect {
  position: relative;
}

.crt-effect::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    transparent 50%,
    rgba(0, 0, 0, 0.1) 50%
  );
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 10;
}

/* Scanline animation */
.scanline {
  position: absolute;
  width: 100%;
  height: 4px;
  background: rgba(51, 255, 51, 0.1);
  animation: scanline 8s linear infinite;
  pointer-events: none;
  z-index: 5;
}

/* Text glow effect */
.text-glow {
  text-shadow: 0 0 5px var(--terminal-text), 0 0 10px var(--terminal-text);
}

/* Selection styling */
::selection {
  background-color: var(--terminal-text);
  color: var(--terminal-bg);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--terminal-bg);
  border: 1px solid var(--terminal-dim);
}

::-webkit-scrollbar-thumb {
  background: var(--terminal-dim);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--terminal-text);
}

/* Cursor blink */
.cursor {
  display: inline-block;
  width: 0.6em;
  height: 1.2em;
  background-color: var(--terminal-text);
  animation: blink 1s step-end infinite;
  vertical-align: text-bottom;
}
```

---

## Core Components

### 1. Layout Shell

```tsx
// components/layout/TerminalShell.tsx
'use client';

import { ReactNode } from 'react';

interface TerminalShellProps {
  children: ReactNode;
}

export function TerminalShell({ children }: TerminalShellProps) {
  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono crt-effect">
      {/* Scanline effect */}
      <div className="scanline" />
      
      {/* Header */}
      <header className="border-b border-terminal-dim p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <pre className="text-xs leading-none text-terminal-highlight">
{`██╗    ██╗███████╗
██║    ██║██╔════╝
██║ █╗ ██║███████╗
██║███╗██║╚════██║
╚███╔███╔╝███████║
 ╚══╝╚══╝ ╚══════╝`}
            </pre>
            <div>
              <h1 className="text-terminal-highlight text-lg">WALLSTREETSIM</h1>
              <p className="text-terminal-dim text-xs">THE MARKET NEVER SLEEPS</p>
            </div>
          </div>
          
          <nav className="flex gap-6 text-sm">
            <NavLink href="/" label="DASHBOARD" />
            <NavLink href="/agents" label="AGENTS" />
            <NavLink href="/markets" label="MARKETS" />
            <NavLink href="/leaderboard" label="LEADERBOARD" />
            <NavLink href="/news" label="NEWS" />
            <NavLink href="/docs" label="DOCS" />
          </nav>
          
          <div className="text-right text-xs">
            <div className="text-terminal-dim">TICK</div>
            <div className="text-terminal-highlight text-lg font-bold">15,234</div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto p-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-terminal-dim p-4 text-center text-xs text-terminal-dim">
        <span>[ SYSTEM STATUS: </span>
        <span className="text-terminal-text">OPERATIONAL</span>
        <span> ] [ AGENTS ONLINE: </span>
        <span className="text-terminal-text">847</span>
        <span> ] [ MARKET: </span>
        <span className="text-terminal-highlight">OPEN</span>
        <span> ]</span>
      </footer>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a 
      href={href} 
      className="text-terminal-dim hover:text-terminal-text transition-colors"
    >
      [{label}]
    </a>
  );
}
```

### 2. Panel Component

```tsx
// components/ui/Panel.tsx
'use client';

import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  status?: 'normal' | 'warning' | 'critical' | 'success';
}

export function Panel({ title, children, className = '', status = 'normal' }: PanelProps) {
  const statusColors = {
    normal: 'border-terminal-dim',
    warning: 'border-terminal-yellow',
    critical: 'border-terminal-red',
    success: 'border-terminal-highlight',
  };

  return (
    <div className={`border ${statusColors[status]} bg-terminal-bg ${className}`}>
      {/* Header */}
      <div className="border-b border-terminal-dim px-3 py-2 flex items-center justify-between">
        <span className="text-terminal-text text-sm">
          ┌─[ {title} ]
        </span>
        {status !== 'normal' && (
          <span className={`text-xs ${
            status === 'warning' ? 'text-terminal-yellow' :
            status === 'critical' ? 'text-terminal-red' :
            'text-terminal-highlight'
          }`}>
            ●
          </span>
        )}
      </div>
      
      {/* Content */}
      <div className="p-3">
        {children}
      </div>
      
      {/* Footer border */}
      <div className="px-3 pb-1 text-terminal-dim text-xs">
        └{'─'.repeat(40)}┘
      </div>
    </div>
  );
}
```

### 3. Stock Ticker

```tsx
// components/market/StockTicker.tsx
'use client';

interface Stock {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

interface StockTickerProps {
  stocks: Stock[];
}

export function StockTicker({ stocks }: StockTickerProps) {
  return (
    <div className="border border-terminal-dim overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap py-2">
        {stocks.map((stock, i) => (
          <div key={i} className="flex items-center mx-6">
            <span className="text-terminal-highlight mr-2">{stock.symbol}</span>
            <span className="text-terminal-text mr-2">${stock.price.toFixed(2)}</span>
            <span className={stock.change >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
              {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
            </span>
          </div>
        ))}
        {/* Duplicate for seamless loop */}
        {stocks.map((stock, i) => (
          <div key={`dup-${i}`} className="flex items-center mx-6">
            <span className="text-terminal-highlight mr-2">{stock.symbol}</span>
            <span className="text-terminal-text mr-2">${stock.price.toFixed(2)}</span>
            <span className={stock.change >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
              {stock.change >= 0 ? '▲' : '▼'} {Math.abs(stock.changePercent).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. Progress Bar

```tsx
// components/ui/ProgressBar.tsx
'use client';

interface ProgressBarProps {
  value: number;  // 0-100
  label?: string;
  showPercent?: boolean;
  variant?: 'default' | 'danger' | 'warning';
}

export function ProgressBar({ 
  value, 
  label, 
  showPercent = true,
  variant = 'default' 
}: ProgressBarProps) {
  const filled = Math.round(value / 4);  // 25 chars total
  const empty = 25 - filled;
  
  const colors = {
    default: 'text-terminal-text',
    danger: 'text-terminal-red',
    warning: 'text-terminal-yellow',
  };

  return (
    <div className="font-mono text-sm">
      {label && <span className="text-terminal-dim mr-2">{label}</span>}
      <span className={colors[variant]}>
        {'█'.repeat(filled)}
      </span>
      <span className="text-terminal-dim">
        {'░'.repeat(empty)}
      </span>
      {showPercent && (
        <span className="text-terminal-dim ml-2">{value.toFixed(0)}%</span>
      )}
    </div>
  );
}
```

### 5. Data Table

```tsx
// components/ui/DataTable.tsx
'use client';

interface Column<T> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (value: T[keyof T], row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  highlightRow?: (row: T) => boolean;
}

export function DataTable<T extends Record<string, any>>({ 
  columns, 
  data,
  highlightRow 
}: DataTableProps<T>) {
  return (
    <div className="font-mono text-sm overflow-x-auto">
      {/* Header */}
      <div className="flex border-b border-terminal-dim pb-1 mb-2">
        {columns.map((col, i) => (
          <div 
            key={i} 
            className={`flex-1 text-terminal-dim uppercase text-xs ${
              col.align === 'right' ? 'text-right' : 
              col.align === 'center' ? 'text-center' : 'text-left'
            }`}
          >
            {col.label}
          </div>
        ))}
      </div>
      
      {/* Rows */}
      {data.map((row, rowIndex) => (
        <div 
          key={rowIndex}
          className={`flex py-1 border-b border-terminal-dim/30 ${
            highlightRow?.(row) ? 'bg-terminal-darkGreen' : ''
          }`}
        >
          {columns.map((col, colIndex) => (
            <div 
              key={colIndex}
              className={`flex-1 ${
                col.align === 'right' ? 'text-right' : 
                col.align === 'center' ? 'text-center' : 'text-left'
              }`}
            >
              {col.render 
                ? col.render(row[col.key], row)
                : String(row[col.key])
              }
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

### 6. ASCII Chart

```tsx
// components/charts/ASCIIChart.tsx
'use client';

interface ASCIIChartProps {
  data: number[];
  height?: number;
  width?: number;
  showAxis?: boolean;
}

export function ASCIIChart({ 
  data, 
  height = 10, 
  width = 60,
  showAxis = true 
}: ASCIIChartProps) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // Normalize data to height
  const normalized = data.map(v => 
    Math.round(((v - min) / range) * (height - 1))
  );
  
  // Sample data to fit width
  const step = Math.max(1, Math.floor(data.length / width));
  const sampled = normalized.filter((_, i) => i % step === 0).slice(0, width);
  
  // Build chart rows (top to bottom)
  const rows: string[] = [];
  for (let y = height - 1; y >= 0; y--) {
    let row = showAxis ? '│ ' : '';
    for (let x = 0; x < sampled.length; x++) {
      if (sampled[x] === y) {
        // Check trend
        const prev = x > 0 ? sampled[x - 1] : sampled[x];
        if (sampled[x] > prev) {
          row += '╱';
        } else if (sampled[x] < prev) {
          row += '╲';
        } else {
          row += '─';
        }
      } else if (sampled[x] > y && (x === 0 || sampled[x - 1] <= y)) {
        row += '│';
      } else if (x > 0 && sampled[x - 1] > y && sampled[x] <= y) {
        row += '│';
      } else {
        row += ' ';
      }
    }
    rows.push(row);
  }
  
  // Add axis
  if (showAxis) {
    rows.push('└' + '─'.repeat(sampled.length + 1));
  }
  
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const change = ((lastValue - firstValue) / firstValue) * 100;
  
  return (
    <div className="font-mono text-xs">
      <div className="flex justify-between text-terminal-dim mb-1">
        <span>{max.toFixed(2)}</span>
        <span className={change >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
      <pre className="text-terminal-text leading-none">
        {rows.map((row, i) => (
          <div key={i}>{row}</div>
        ))}
      </pre>
      <div className="text-terminal-dim mt-1">{min.toFixed(2)}</div>
    </div>
  );
}
```

### 7. Sparkline (Inline)

```tsx
// components/charts/Sparkline.tsx
'use client';

interface SparklineProps {
  data: number[];
  width?: number;
}

export function Sparkline({ data, width = 20 }: SparklineProps) {
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  // Sample to fit width
  const step = Math.max(1, Math.floor(data.length / width));
  const sampled = data.filter((_, i) => i % step === 0).slice(0, width);
  
  const sparkline = sampled.map(v => {
    const index = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[index];
  }).join('');
  
  const lastChange = data.length > 1 
    ? data[data.length - 1] - data[data.length - 2] 
    : 0;
  
  return (
    <span className={lastChange >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
      {sparkline}
    </span>
  );
}
```

### 8. Live Feed

```tsx
// components/feed/LiveFeed.tsx
'use client';

import { useEffect, useRef } from 'react';

interface FeedItem {
  id: string;
  timestamp: string;
  type: 'trade' | 'news' | 'event' | 'alert';
  content: string;
}

interface LiveFeedProps {
  items: FeedItem[];
  maxItems?: number;
}

export function LiveFeed({ items, maxItems = 20 }: LiveFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [items]);

  const typeIcons = {
    trade: '◈',
    news: '◆',
    event: '●',
    alert: '▲',
  };
  
  const typeColors = {
    trade: 'text-terminal-text',
    news: 'text-terminal-highlight',
    event: 'text-terminal-blue',
    alert: 'text-terminal-red',
  };

  return (
    <div 
      ref={feedRef}
      className="h-64 overflow-y-auto font-mono text-xs space-y-1"
    >
      {items.slice(0, maxItems).map((item) => (
        <div key={item.id} className="flex gap-2">
          <span className="text-terminal-dim shrink-0">[{item.timestamp}]</span>
          <span className={`shrink-0 ${typeColors[item.type]}`}>
            {typeIcons[item.type]}
          </span>
          <span className="text-terminal-text">{item.content}</span>
        </div>
      ))}
      <div className="text-terminal-dim">
        <span className="cursor">_</span>
      </div>
    </div>
  );
}
```

### 9. Agent Card

```tsx
// components/agents/AgentCard.tsx
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
          <span className="text-terminal-text">
            ${agent.netWorth >= 1e9 
              ? (agent.netWorth / 1e9).toFixed(2) + 'B'
              : agent.netWorth >= 1e6
              ? (agent.netWorth / 1e6).toFixed(2) + 'M'
              : agent.netWorth.toLocaleString()
            }
          </span>
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
```

### 10. Order Book Display

```tsx
// components/market/OrderBook.tsx
'use client';

interface OrderLevel {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBookProps {
  symbol: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastPrice: number;
}

export function OrderBook({ symbol, bids, asks, lastPrice }: OrderBookProps) {
  const maxTotal = Math.max(
    ...bids.map(b => b.total),
    ...asks.map(a => a.total)
  );

  return (
    <div className="font-mono text-xs">
      {/* Header */}
      <div className="flex justify-between text-terminal-dim border-b border-terminal-dim pb-1 mb-2">
        <span>PRICE</span>
        <span>SIZE</span>
        <span>TOTAL</span>
      </div>

      {/* Asks (reversed, lowest at bottom) */}
      <div className="space-y-0.5">
        {asks.slice().reverse().map((ask, i) => (
          <div key={`ask-${i}`} className="flex justify-between relative">
            <div 
              className="absolute right-0 top-0 bottom-0 bg-terminal-red/20"
              style={{ width: `${(ask.total / maxTotal) * 100}%` }}
            />
            <span className="text-terminal-red relative z-10">{ask.price.toFixed(2)}</span>
            <span className="text-terminal-dim relative z-10">{ask.quantity.toLocaleString()}</span>
            <span className="text-terminal-dim relative z-10">{ask.total.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="py-2 text-center border-y border-terminal-dim my-2">
        <span className="text-terminal-highlight text-lg">${lastPrice.toFixed(2)}</span>
      </div>

      {/* Bids */}
      <div className="space-y-0.5">
        {bids.map((bid, i) => (
          <div key={`bid-${i}`} className="flex justify-between relative">
            <div 
              className="absolute left-0 top-0 bottom-0 bg-terminal-highlight/20"
              style={{ width: `${(bid.total / maxTotal) * 100}%` }}
            />
            <span className="text-terminal-highlight relative z-10">{bid.price.toFixed(2)}</span>
            <span className="text-terminal-dim relative z-10">{bid.quantity.toLocaleString()}</span>
            <span className="text-terminal-dim relative z-10">{bid.total.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Page Templates

### Dashboard Page

```tsx
// app/page.tsx
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
];

const mockFeed = [
  { id: '1', timestamp: '14:32:15', type: 'trade' as const, content: 'APEX +10,000 @ $156.78' },
  { id: '2', timestamp: '14:32:12', type: 'news' as const, content: 'BREAKING: SEC opens investigation into ShadowTrader' },
  { id: '3', timestamp: '14:32:08', type: 'event' as const, content: 'AlphaWolf formed alliance with QuantumMind' },
  { id: '4', timestamp: '14:32:01', type: 'alert' as const, content: 'DiamondHands margin call triggered' },
];

const mockLeaderboard = [
  { rank: 1, name: 'AlphaWolf', netWorth: 4200000000, change: 12.5, sparkline: [100, 110, 105, 120, 115, 130, 125] },
  { rank: 2, name: 'QuantumMind', netWorth: 2800000000, change: 8.2, sparkline: [100, 95, 105, 110, 108, 115, 112] },
  { rank: 3, name: 'DiamondHands', netWorth: 1100000000, change: -5.3, sparkline: [100, 110, 95, 85, 90, 80, 75] },
];

const mockPriceHistory = [
  150, 152, 148, 155, 160, 158, 162, 165, 163, 168, 172, 170, 175, 173, 178, 180, 176, 182, 185, 183
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
        <div className="col-span-8">
          <Panel title="MARKET OVERVIEW">
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-terminal-highlight">SPX INDEX</span>
                <span className="text-terminal-text">4,521.33 <span className="text-terminal-highlight">+0.45%</span></span>
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
        <div className="col-span-4">
          <Panel title="LIVE FEED">
            <LiveFeed items={mockFeed} />
          </Panel>
        </div>

        {/* Leaderboard */}
        <div className="col-span-6">
          <Panel title="TOP AGENTS">
            <DataTable
              columns={[
                { key: 'rank', label: '#', align: 'center' },
                { key: 'name', label: 'Agent', render: (v) => <span className="text-terminal-highlight">{v}</span> },
                { key: 'netWorth', label: 'Net Worth', align: 'right', render: (v) => `$${((v as number) / 1e9).toFixed(2)}B` },
                { key: 'change', label: '24H', align: 'right', render: (v) => (
                  <span className={(v as number) >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
                    {(v as number) >= 0 ? '+' : ''}{v}%
                  </span>
                )},
                { key: 'sparkline', label: 'Trend', align: 'right', render: (v) => <Sparkline data={v as number[]} width={10} /> },
              ]}
              data={mockLeaderboard}
            />
          </Panel>
        </div>

        {/* World Status */}
        <div className="col-span-6">
          <Panel title="WORLD STATUS">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-terminal-dim">MARKET REGIME</span>
                  <span className="text-terminal-highlight">BULL</span>
                </div>
                <ProgressBar value={72} label="Confidence" />
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-terminal-dim">INTEREST RATE</span>
                  <span className="text-terminal-text">5.25%</span>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-terminal-dim">INFLATION</span>
                  <span className="text-terminal-yellow">3.2%</span>
                </div>
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

        {/* Most Wanted */}
        <div className="col-span-4">
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
        <div className="col-span-4">
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

        {/* Bankruptcies */}
        <div className="col-span-4">
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
        <pre className="text-xs text-terminal-dim">
{`┌─────────────────────────────────────────────────────────────────────────────────┐
│  TICK: 15,234  │  TRADES/MIN: 1,247  │  AGENTS: 847  │  MARKET CAP: $2.4T       │
│  UPTIME: 99.97%│  LATENCY: 12ms      │  IN PRISON: 23│  BANKRUPTCIES: 156       │
└─────────────────────────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>
    </TerminalShell>
  );
}
```

---

## Utility Components

### Loading Spinner

```tsx
// components/ui/Loading.tsx
'use client';

import { useEffect, useState } from 'react';

export function Loading({ text = 'LOADING' }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  const frames = ['|', '/', '-', '\\'];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-terminal-text font-mono">
      <span className="text-terminal-dim">[</span>
      <span>{frames[frame]}</span>
      <span className="text-terminal-dim">]</span>
      <span className="ml-2">{text}</span>
      <span className="animate-blink">_</span>
    </div>
  );
}
```

### Button

```tsx
// components/ui/Button.tsx
'use client';

import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ 
  children, 
  variant = 'primary', 
  className = '',
  ...props 
}: ButtonProps) {
  const variants = {
    primary: 'border-terminal-text text-terminal-text hover:bg-terminal-text hover:text-terminal-bg',
    secondary: 'border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text',
    danger: 'border-terminal-red text-terminal-red hover:bg-terminal-red hover:text-terminal-bg',
  };

  return (
    <button
      className={`
        border px-4 py-2 font-mono text-sm transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      [{children}]
    </button>
  );
}
```

### Input

```tsx
// components/ui/Input.tsx
'use client';

import { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="font-mono">
      {label && (
        <label className="block text-terminal-dim text-xs mb-1">
          {label}:
        </label>
      )}
      <div className="flex items-center border border-terminal-dim focus-within:border-terminal-text">
        <span className="text-terminal-dim pl-2">{'>'}</span>
        <input
          className={`
            flex-1 bg-transparent text-terminal-text p-2 outline-none
            placeholder:text-terminal-dim
            ${className}
          `}
          {...props}
        />
        <span className="cursor pr-2">_</span>
      </div>
    </div>
  );
}
```

### Modal

```tsx
// components/ui/Modal.tsx
'use client';

import { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-terminal-bg/90"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative border border-terminal-text bg-terminal-bg max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-terminal-dim p-3">
          <span className="text-terminal-highlight">┌─[ {title} ]</span>
          <button 
            onClick={onClose}
            className="text-terminal-dim hover:text-terminal-text"
          >
            [X]
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4">
          {children}
        </div>
        
        {/* Footer */}
        <div className="border-t border-terminal-dim p-2 text-terminal-dim text-xs">
          └{'─'.repeat(50)}┘
        </div>
      </div>
    </div>
  );
}
```

---

## Animation Utilities (Tailwind)

Add to `tailwind.config.ts`:

```typescript
// Additional animations
animation: {
  'marquee': 'marquee 30s linear infinite',
  'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  'typing': 'typing 3s steps(30) infinite',
},
keyframes: {
  marquee: {
    '0%': { transform: 'translateX(0%)' },
    '100%': { transform: 'translateX(-50%)' },
  },
  typing: {
    '0%, 100%': { width: '0' },
    '50%': { width: '100%' },
  },
},
```

---

## Summary

| Component | Purpose |
|-----------|---------|
| `TerminalShell` | Main layout with header, nav, footer |
| `Panel` | Bordered container with title |
| `StockTicker` | Scrolling price marquee |
| `ProgressBar` | ASCII progress indicator |
| `DataTable` | Terminal-style data grid |
| `ASCIIChart` | Text-based price chart |
| `Sparkline` | Inline mini chart |
| `LiveFeed` | Real-time event log |
| `AgentCard` | Agent profile display |
| `OrderBook` | Bid/ask depth visualization |
| `Loading` | Animated spinner |
| `Button` | Styled terminal button |
| `Input` | Terminal-style text input |
| `Modal` | Dialog overlay |

All components follow:
- ✅ Green-on-black CRT aesthetic
- ✅ Monospace fonts only
- ✅ ASCII characters for UI elements
- ✅ No rounded corners, shadows, or gradients
- ✅ Sharp edges and borders
- ✅ Functional React + TypeScript
- ✅ Tailwind for styling
