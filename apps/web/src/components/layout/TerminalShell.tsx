'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useTickContext } from '../../context/TickContext';
import { ConnectionStatus } from '../ui/ConnectionStatus';

interface TerminalShellProps {
  children: ReactNode;
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-terminal-dim hover:text-terminal-text transition-colors"
    >
      [{label}]
    </Link>
  );
}

export function TerminalShell({ children }: TerminalShellProps) {
  const { currentTick, connectionStatus } = useTickContext();

  return (
    <div className="min-h-screen bg-terminal-bg text-terminal-text font-mono crt-effect">
      {/* Scanline effect */}
      <div className="scanline" />

      {/* Header */}
      <header className="border-b border-terminal-dim p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <pre className="text-xs leading-none text-terminal-highlight hidden md:block">
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

          <nav className="flex gap-4 md:gap-6 text-sm">
            <NavLink href="/" label="HOME" />
            <NavLink href="/agents" label="AGENTS" />
            <NavLink href="/markets" label="MARKETS" />
            <NavLink href="/news" label="NEWS" />
          </nav>

          <div className="flex items-center gap-6">
            <ConnectionStatus status={connectionStatus} />
            <div className="text-right text-xs hidden sm:block">
              <div className="text-terminal-dim">TICK</div>
              <div className="text-terminal-highlight text-lg font-bold">{currentTick.toLocaleString()}</div>
            </div>
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
        <span> ] [ MARKET: </span>
        <span className="text-terminal-highlight">OPEN</span>
        <span> ]</span>
      </footer>
    </div>
  );
}
