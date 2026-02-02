'use client';

import { useState, useMemo } from 'react';
import { TerminalShell } from '@/components/layout/TerminalShell';
import { Panel } from '@/components/ui/Panel';
import { useNews, type NewsItem } from '@/hooks/useNews';
import type { NewsCategory } from '@wallstreetsim/types';

const CATEGORY_DISPLAY: Record<NewsCategory, { label: string; icon: string }> = {
  earnings: { label: 'EARNINGS', icon: '◈' },
  merger: { label: 'M&A', icon: '◇' },
  scandal: { label: 'SCANDAL', icon: '▲' },
  regulatory: { label: 'REGULATORY', icon: '◉' },
  market: { label: 'MARKET', icon: '▸' },
  product: { label: 'PRODUCT', icon: '◆' },
  analysis: { label: 'ANALYSIS', icon: '●' },
  crime: { label: 'CRIME', icon: '▲' },
  rumor: { label: 'RUMOR', icon: '○' },
  company: { label: 'COMPANY', icon: '◇' },
};

const CATEGORY_COLORS: Record<NewsCategory, string> = {
  earnings: 'text-terminal-highlight',
  merger: 'text-terminal-blue',
  scandal: 'text-terminal-red',
  regulatory: 'text-terminal-yellow',
  market: 'text-terminal-text',
  product: 'text-terminal-highlight',
  analysis: 'text-terminal-dim',
  crime: 'text-terminal-red',
  rumor: 'text-terminal-yellow',
  company: 'text-terminal-text',
};

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatSentiment(sentiment: number): { label: string; color: string } {
  if (sentiment > 0.3) return { label: '▲ BULLISH', color: 'text-terminal-highlight' };
  if (sentiment < -0.3) return { label: '▼ BEARISH', color: 'text-terminal-red' };
  return { label: '─ NEUTRAL', color: 'text-terminal-dim' };
}

interface NewsCardProps {
  article: NewsItem;
  isExpanded: boolean;
  onToggle: () => void;
}

function NewsCard({ article, isExpanded, onToggle }: NewsCardProps) {
  const category = CATEGORY_DISPLAY[article.category] || { label: article.category?.toUpperCase() || 'NEWS', icon: '●' };
  const categoryColor = CATEGORY_COLORS[article.category] || 'text-terminal-text';
  const sentiment = formatSentiment(article.sentiment);

  return (
    <div
      className={`border border-terminal-dim p-3 cursor-pointer hover:border-terminal-text transition-colors ${
        article.isBreaking ? 'border-terminal-red bg-terminal-red/5' : ''
      }`}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {article.isBreaking && (
            <span className="text-terminal-red text-xs animate-pulse">[BREAKING]</span>
          )}
          <span className={`text-xs ${categoryColor}`}>
            {category.icon} {category.label}
          </span>
        </div>
        <span className="text-terminal-dim text-xs shrink-0">
          T:{article.tick} | {formatTimestamp(article.receivedAt)}
        </span>
      </div>

      {/* Headline */}
      <div className={`text-sm ${article.isBreaking ? 'text-terminal-red' : 'text-terminal-text'}`}>
        {article.headline}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-terminal-dim/50">
          {article.content && (
            <div className="text-xs text-terminal-dim mb-3 whitespace-pre-wrap">
              {article.content}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs">
            {/* Sentiment */}
            <div>
              <span className="text-terminal-dim">SENTIMENT: </span>
              <span className={sentiment.color}>{sentiment.label}</span>
            </div>

            {/* Symbols */}
            {article.symbols.length > 0 && (
              <div>
                <span className="text-terminal-dim">SYMBOLS: </span>
                <span className="text-terminal-highlight">
                  {article.symbols.join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expand indicator */}
      <div className="text-terminal-dim text-xs mt-2 text-right">
        {isExpanded ? '▲ collapse' : '▼ expand'}
      </div>
    </div>
  );
}

export default function NewsPage() {
  const { articles, breakingNews, isConnected, connectionStatus, clearNews } = useNews({
    maxArticles: 200,
    autoConnect: true,
  });

  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | 'all'>('all');
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const [showBreakingOnly, setShowBreakingOnly] = useState(false);

  const filteredArticles = useMemo(() => {
    let filtered = articles;

    if (showBreakingOnly) {
      filtered = filtered.filter((a) => a.isBreaking);
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter((a) => a.category === categoryFilter);
    }

    return filtered;
  }, [articles, categoryFilter, showBreakingOnly]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: articles.length };
    for (const article of articles) {
      const cat = article.category || 'unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [articles]);

  const stats = useMemo(() => {
    const total = articles.length;
    const breaking = breakingNews.length;
    const bullish = articles.filter((a) => a.sentiment > 0.3).length;
    const bearish = articles.filter((a) => a.sentiment < -0.3).length;
    return { total, breaking, bullish, bearish };
  }, [articles, breakingNews]);

  return (
    <TerminalShell>
      {/* Header Stats */}
      <div className="mb-4 border border-terminal-dim p-3">
        <pre className="text-xs text-terminal-dim text-center">
{`┌────────────────────────────────────────────────────────────────────────────────┐
│  ARTICLES: ${String(stats.total).padStart(4)}  │  BREAKING: ${String(stats.breaking).padStart(3)}  │  BULLISH: ${String(stats.bullish).padStart(4)}  │  BEARISH: ${String(stats.bearish).padStart(4)}  │  STATUS: ${(connectionStatus === 'connected' ? 'LIVE' : connectionStatus.toUpperCase()).padStart(6)} │
└────────────────────────────────────────────────────────────────────────────────┘`}
        </pre>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left Sidebar - Filters */}
        <div className="col-span-12 lg:col-span-3">
          <Panel title="FILTERS">
            <div className="space-y-4">
              {/* Category Filter */}
              <div>
                <div className="text-terminal-dim text-xs mb-2">CATEGORY</div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as NewsCategory | 'all')}
                  className="w-full bg-terminal-bg border border-terminal-dim text-terminal-text p-2 text-sm focus:outline-none focus:border-terminal-text"
                >
                  <option value="all">[ ALL CATEGORIES ] ({categoryCounts.all || 0})</option>
                  {(Object.keys(CATEGORY_DISPLAY) as NewsCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_DISPLAY[cat].icon} {CATEGORY_DISPLAY[cat].label} ({categoryCounts[cat] || 0})
                    </option>
                  ))}
                </select>
              </div>

              {/* Breaking News Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showBreakingOnly}
                    onChange={(e) => setShowBreakingOnly(e.target.checked)}
                    className="accent-terminal-highlight"
                  />
                  <span className="text-terminal-text text-sm">Breaking News Only</span>
                </label>
              </div>

              {/* Clear Button */}
              <button
                onClick={clearNews}
                className="w-full border border-terminal-dim text-terminal-dim hover:border-terminal-text hover:text-terminal-text p-2 text-sm transition-colors"
              >
                [CLEAR FEED]
              </button>

              {/* Quick Stats */}
              <div className="border-t border-terminal-dim pt-4 mt-4">
                <div className="text-terminal-dim text-xs mb-2">SHOWING</div>
                <div className="text-terminal-highlight text-lg">
                  {filteredArticles.length} / {articles.length}
                </div>
                <div className="text-terminal-dim text-xs">articles</div>
              </div>
            </div>
          </Panel>

          {/* Breaking News Panel */}
          {breakingNews.length > 0 && (
            <div className="mt-4">
              <Panel title="BREAKING NEWS" status="critical">
                <div className="space-y-2">
                  {breakingNews.slice(0, 5).map((article) => (
                    <button
                      key={article.id}
                      onClick={() => setExpandedArticleId(article.id)}
                      className="w-full text-left text-xs text-terminal-red hover:text-terminal-highlight transition-colors"
                    >
                      <span className="animate-pulse">●</span> {article.headline.slice(0, 50)}
                      {article.headline.length > 50 ? '...' : ''}
                    </button>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* Connection Status */}
          <div className="mt-4 border border-terminal-dim p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-terminal-dim">CONNECTION</span>
              <span
                className={
                  connectionStatus === 'connected'
                    ? 'text-terminal-highlight'
                    : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                      ? 'text-terminal-yellow'
                      : 'text-terminal-red'
                }
              >
                {connectionStatus === 'connected'
                  ? '● LIVE'
                  : connectionStatus === 'connecting'
                    ? '○ CONNECTING...'
                    : connectionStatus === 'reconnecting'
                      ? '○ RECONNECTING...'
                      : '○ OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Main Content - News Feed */}
        <div className="col-span-12 lg:col-span-9">
          <Panel title="NEWS ARCHIVE" status={isConnected ? undefined : 'warning'}>
            {filteredArticles.length > 0 ? (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                {filteredArticles.map((article) => (
                  <NewsCard
                    key={article.id}
                    article={article}
                    isExpanded={expandedArticleId === article.id}
                    onToggle={() =>
                      setExpandedArticleId(expandedArticleId === article.id ? null : article.id)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-terminal-dim text-xs text-center py-8">
                <pre>
{`┌────────────────────────────────────┐
│                                    │
│   ${isConnected ? 'Waiting for news articles...' : 'Connecting to news feed...'}   │
│                                    │
│   News articles will appear here   │
│   as they are published during     │
│   the simulation.                  │
│                                    │
└────────────────────────────────────┘`}
                </pre>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </TerminalShell>
  );
}
