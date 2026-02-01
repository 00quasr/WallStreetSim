'use client';

interface ProgressBarProps {
  value: number;
  label?: string;
  showPercent?: boolean;
  variant?: 'default' | 'danger' | 'warning';
}

export function ProgressBar({
  value,
  label,
  showPercent = true,
  variant = 'default',
}: ProgressBarProps) {
  const filled = Math.round(Math.min(100, Math.max(0, value)) / 4);
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
