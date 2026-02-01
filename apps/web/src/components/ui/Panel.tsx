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
