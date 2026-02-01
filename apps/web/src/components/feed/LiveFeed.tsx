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
