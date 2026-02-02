'use client';

import { useWorldStatus } from '@/hooks/useWorldStatus';
import { useTickContext } from '@/context/TickContext';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { MarketRegime } from '@wallstreetsim/types';

function getRegimeDisplay(regime: MarketRegime): { label: string; color: string } {
  switch (regime) {
    case 'bull':
      return { label: 'BULL', color: 'text-terminal-highlight' };
    case 'bear':
      return { label: 'BEAR', color: 'text-terminal-red' };
    case 'crash':
      return { label: 'CRASH', color: 'text-terminal-red' };
    case 'bubble':
      return { label: 'BUBBLE', color: 'text-terminal-yellow' };
    case 'normal':
    default:
      return { label: 'NORMAL', color: 'text-terminal-text' };
  }
}

function getRegimeConfidence(regime: MarketRegime): number {
  switch (regime) {
    case 'bull':
      return 75;
    case 'bear':
      return 65;
    case 'crash':
      return 90;
    case 'bubble':
      return 70;
    case 'normal':
    default:
      return 50;
  }
}

function getRegimeProgressVariant(regime: MarketRegime): 'default' | 'danger' | 'warning' {
  switch (regime) {
    case 'crash':
    case 'bear':
      return 'danger';
    case 'bubble':
      return 'warning';
    default:
      return 'default';
  }
}

export function WorldStatus() {
  const { worldStatus, isLoading, error } = useWorldStatus();
  const { regime: wsRegime, events } = useTickContext();

  // Use WebSocket regime for real-time updates, fall back to polled data
  const regime = wsRegime || worldStatus?.regime || 'normal';
  const regimeDisplay = getRegimeDisplay(regime);
  const confidence = getRegimeConfidence(regime);
  const progressVariant = getRegimeProgressVariant(regime);

  const interestRate = worldStatus?.interestRate ?? 0;
  const inflationRate = worldStatus?.inflationRate ?? 0;

  if (isLoading && !worldStatus) {
    return (
      <div className="text-terminal-dim text-xs text-center py-4">
        Loading world status...
      </div>
    );
  }

  if (error && !worldStatus) {
    return (
      <div className="text-terminal-red text-xs text-center py-4">
        Failed to load world status
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-terminal-dim">MARKET REGIME</span>
          <span className={regimeDisplay.color}>{regimeDisplay.label}</span>
        </div>
        <ProgressBar value={confidence} label="Confidence" variant={progressVariant} />
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-terminal-dim">INTEREST RATE</span>
        <span className="text-terminal-text">{(interestRate * 100).toFixed(2)}%</span>
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-terminal-dim">INFLATION</span>
        <span className={inflationRate > 0.03 ? 'text-terminal-yellow' : 'text-terminal-text'}>
          {(inflationRate * 100).toFixed(1)}%
        </span>
      </div>

      <div className="pt-3 border-t border-terminal-dim">
        <div className="text-terminal-dim text-xs mb-2">ACTIVE EVENTS</div>
        <div className="text-xs space-y-1">
          {events.length > 0 ? (
            events.slice(0, 3).map((event) => (
              <div key={event.id}>
                <span className="text-terminal-dim">{'●'} </span>
                <span className={event.impact >= 0 ? 'text-terminal-highlight' : 'text-terminal-yellow'}>
                  {event.type}
                </span>
                {event.duration > 0 && (
                  <span className="text-terminal-dim"> - {event.duration} ticks remaining</span>
                )}
              </div>
            ))
          ) : (
            <div className="text-terminal-dim">No active events</div>
          )}
        </div>
      </div>
    </div>
  );
}
