'use client';

import { useState, useMemo } from 'react';
import { TerminalShell } from '@/components/layout/TerminalShell';
import { Panel } from '@/components/ui/Panel';
import { DataTable } from '@/components/ui/DataTable';
import { StockTicker } from '@/components/market/StockTicker';
import { OrderBook } from '@/components/market/OrderBook';
import { ASCIIChart } from '@/components/charts/ASCIIChart';
import { Sparkline } from '@/components/charts/Sparkline';
import { useMarketData, type PriceData } from '@/hooks/useMarketData';
import type { Sector } from '@wallstreetsim/types';

type SortField = 'symbol' | 'price' | 'changePercent' | 'volume' | 'marketCap';
type SortDirection = 'asc' | 'desc';

const SECTOR_DISPLAY_NAMES: Record<Sector, string> = {
  Technology: 'TECH',
  Finance: 'FIN',
  Healthcare: 'HEALTH',
  Energy: 'ENERGY',
  Consumer: 'CONSUMER',
  Industrial: 'INDUST',
  RealEstate: 'REAL EST',
  Utilities: 'UTIL',
  Crypto: 'CRYPTO',
  Meme: 'MEME',
};

function formatPrice(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatVolume(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
}

export default function MarketsPage() {
  const { priceList, getPriceHistory, isConnected, connectionStatus } = useMarketData({
    autoConnect: true,
  });

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('symbol');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [sectorFilter, setSectorFilter] = useState<Sector | 'all'>('all');

  // Calculate market stats
  const marketStats = useMemo(() => {
    const total = priceList.length;
    const gainers = priceList.filter((s) => s.changePercent > 0).length;
    const losers = priceList.filter((s) => s.changePercent < 0).length;
    const unchanged = total - gainers - losers;
    const totalVolume = priceList.reduce((sum, s) => sum + s.volume, 0);
    const avgChange =
      priceList.length > 0
        ? priceList.reduce((sum, s) => sum + s.changePercent, 0) / priceList.length
        : 0;
    return { total, gainers, losers, unchanged, totalVolume, avgChange };
  }, [priceList]);

  // Sort and filter stocks
  const sortedStocks = useMemo(() => {
    const filtered = priceList;

    return [...filtered].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortField) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'price':
          aVal = a.price;
          bVal = b.price;
          break;
        case 'changePercent':
          aVal = a.changePercent;
          bVal = b.changePercent;
          break;
        case 'volume':
          aVal = a.volume;
          bVal = b.volume;
          break;
        case 'marketCap':
          // Estimate market cap from price (actual would come from API)
          aVal = a.price * 1000000;
          bVal = b.price * 1000000;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [priceList, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const selectedStock = useMemo(() => {
    return priceList.find((s) => s.symbol === selectedSymbol) || null;
  }, [priceList, selectedSymbol]);

  const selectedPriceHistory = useMemo(() => {
    if (!selectedSymbol) return [];
    return getPriceHistory(selectedSymbol);
  }, [selectedSymbol, getPriceHistory]);

  // Get top gainers and losers
  const topGainers = useMemo(() => {
    return [...priceList]
      .filter((s) => s.changePercent > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);
  }, [priceList]);

  const topLosers = useMemo(() => {
    return [...priceList]
      .filter((s) => s.changePercent < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);
  }, [priceList]);

  return (
    <TerminalShell>
      {/* Stock Ticker Banner */}
      <div className="mb-4">
        <StockTicker autoConnect={false} />
      </div>

      {/* Market Stats Header */}
      <div className="mb-4 border border-terminal-dim p-3">
        <pre className="text-xs text-terminal-dim text-center">
{`┌────────────────────────────────────────────────────────────────────────────────────┐
│  STOCKS: ${String(marketStats.total).padStart(4)}  │  GAINERS: ${String(marketStats.gainers).padStart(4)}  │  LOSERS: ${String(marketStats.losers).padStart(4)}  │  VOLUME: ${formatVolume(marketStats.totalVolume).padStart(8)}  │  AVG CHG: ${(marketStats.avgChange >= 0 ? '+' : '') + marketStats.avgChange.toFixed(2) + '%'} │
└────────────────────────────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left Sidebar - Movers */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {/* Top Gainers */}
          <Panel title="TOP GAINERS" status={topGainers.length > 0 ? 'success' : 'normal'}>
            {topGainers.length > 0 ? (
              <div className="space-y-2">
                {topGainers.map((stock) => (
                  <button
                    key={stock.symbol}
                    onClick={() => setSelectedSymbol(stock.symbol)}
                    className={`w-full text-left flex items-center justify-between py-1 px-2 border border-terminal-dim/50 hover:border-terminal-highlight transition-colors ${
                      selectedSymbol === stock.symbol ? 'bg-terminal-darkGreen border-terminal-highlight' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-terminal-highlight text-xs">{stock.symbol}</span>
                      <Sparkline data={getPriceHistory(stock.symbol)} width={8} />
                    </div>
                    <span className="text-terminal-highlight text-xs">
                      +{stock.changePercent.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-terminal-dim text-xs text-center py-4">
                {isConnected ? 'No gainers yet' : 'Connecting...'}
              </div>
            )}
          </Panel>

          {/* Top Losers */}
          <Panel title="TOP LOSERS" status={topLosers.length > 0 ? 'critical' : 'normal'}>
            {topLosers.length > 0 ? (
              <div className="space-y-2">
                {topLosers.map((stock) => (
                  <button
                    key={stock.symbol}
                    onClick={() => setSelectedSymbol(stock.symbol)}
                    className={`w-full text-left flex items-center justify-between py-1 px-2 border border-terminal-dim/50 hover:border-terminal-red transition-colors ${
                      selectedSymbol === stock.symbol ? 'bg-terminal-darkGreen border-terminal-red' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-terminal-red text-xs">{stock.symbol}</span>
                      <Sparkline data={getPriceHistory(stock.symbol)} width={8} />
                    </div>
                    <span className="text-terminal-red text-xs">
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-terminal-dim text-xs text-center py-4">
                {isConnected ? 'No losers yet' : 'Connecting...'}
              </div>
            )}
          </Panel>

          {/* Connection Status */}
          <div className="border border-terminal-dim p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-terminal-dim">CONNECTION</span>
              <span className={
                connectionStatus === 'connected' ? 'text-terminal-highlight' :
                connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? 'text-terminal-yellow' :
                'text-terminal-red'
              }>
                {connectionStatus === 'connected' ? '● LIVE' :
                 connectionStatus === 'connecting' ? '○ CONNECTING...' :
                 connectionStatus === 'reconnecting' ? '○ RECONNECTING...' :
                 '○ OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content - Stock List */}
        <div className="col-span-12 lg:col-span-6">
          <Panel title="ALL STOCKS" status={isConnected ? undefined : 'warning'}>
            {/* Sort Controls */}
            <div className="flex gap-2 mb-3 text-xs flex-wrap">
              <span className="text-terminal-dim">SORT BY:</span>
              {(['symbol', 'price', 'changePercent', 'volume'] as SortField[]).map((field) => (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`px-2 py-0.5 border ${
                    sortField === field
                      ? 'border-terminal-highlight text-terminal-highlight'
                      : 'border-terminal-dim text-terminal-dim hover:text-terminal-text'
                  }`}
                >
                  [{field.toUpperCase()}]
                  {sortField === field && (
                    <span className="ml-1">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Stock Table */}
            {sortedStocks.length > 0 ? (
              <DataTable
                columns={[
                  {
                    key: 'symbol',
                    label: 'Symbol',
                    render: (v, row) => (
                      <button
                        onClick={() => setSelectedSymbol((row as PriceData).symbol)}
                        className={`text-terminal-highlight hover:underline ${
                          selectedSymbol === (row as PriceData).symbol ? 'font-bold' : ''
                        }`}
                      >
                        {v as string}
                      </button>
                    ),
                  },
                  {
                    key: 'price',
                    label: 'Price',
                    align: 'right',
                    render: (v) => formatPrice(v as number),
                  },
                  {
                    key: 'changePercent',
                    label: 'Change',
                    align: 'right',
                    render: (v, row) => {
                      const change = v as number;
                      const symbol = (row as PriceData).symbol;
                      const history = getPriceHistory(symbol);
                      return (
                        <div className="flex items-center justify-end gap-2">
                          {history.length > 1 && <Sparkline data={history} width={10} />}
                          <span className={change >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    key: 'volume',
                    label: 'Volume',
                    align: 'right',
                    render: (v) => (
                      <span className="text-terminal-dim">{formatVolume(v as number)}</span>
                    ),
                  },
                  {
                    key: 'high',
                    label: 'H/L',
                    align: 'right',
                    render: (v, row) => {
                      const data = row as PriceData;
                      return (
                        <span className="text-xs text-terminal-dim">
                          {formatPrice(data.high)}/{formatPrice(data.low)}
                        </span>
                      );
                    },
                  },
                ]}
                data={sortedStocks}
                highlightRow={(row) => (row as PriceData).symbol === selectedSymbol}
              />
            ) : (
              <div className="text-terminal-dim text-xs text-center py-8">
                {isConnected ? 'Waiting for market data...' : 'Connecting to market...'}
              </div>
            )}
          </Panel>
        </div>

        {/* Right Sidebar - Selected Stock Details */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {selectedSymbol && selectedStock ? (
            <>
              {/* Stock Info */}
              <Panel title={`${selectedSymbol} DETAILS`}>
                <div className="space-y-3">
                  {/* Current Price */}
                  <div className="text-center border-b border-terminal-dim pb-3">
                    <div className="text-2xl text-terminal-highlight">
                      {formatPrice(selectedStock.price)}
                    </div>
                    <div className={`text-sm ${
                      selectedStock.changePercent >= 0 ? 'text-terminal-highlight' : 'text-terminal-red'
                    }`}>
                      {selectedStock.changePercent >= 0 ? '▲' : '▼'}{' '}
                      {Math.abs(selectedStock.change).toFixed(2)} (
                      {selectedStock.changePercent >= 0 ? '+' : ''}
                      {selectedStock.changePercent.toFixed(2)}%)
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-terminal-dim">HIGH</div>
                      <div className="text-terminal-text">{formatPrice(selectedStock.high)}</div>
                    </div>
                    <div>
                      <div className="text-terminal-dim">LOW</div>
                      <div className="text-terminal-text">{formatPrice(selectedStock.low)}</div>
                    </div>
                    <div>
                      <div className="text-terminal-dim">VOLUME</div>
                      <div className="text-terminal-text">{formatVolume(selectedStock.volume)}</div>
                    </div>
                    <div>
                      <div className="text-terminal-dim">UPDATED</div>
                      <div className="text-terminal-text">
                        {selectedStock.lastUpdate.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Price Chart */}
              {selectedPriceHistory.length > 1 && (
                <Panel title="PRICE CHART">
                  <ASCIIChart
                    data={selectedPriceHistory}
                    height={8}
                    width={40}
                    showAxis={true}
                  />
                </Panel>
              )}

              {/* Order Book */}
              <OrderBook
                symbol={selectedSymbol}
                depth={8}
                autoConnect={false}
              />
            </>
          ) : (
            <Panel title="SELECT A STOCK">
              <div className="text-terminal-dim text-xs text-center py-8">
                <pre>
{`┌────────────────────┐
│                    │
│   Click on a       │
│   stock symbol     │
│   to view          │
│   details          │
│                    │
└────────────────────┘`}
                </pre>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </TerminalShell>
  );
}
