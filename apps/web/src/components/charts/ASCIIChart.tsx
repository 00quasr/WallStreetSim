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
  showAxis = true,
}: ASCIIChartProps) {
  if (data.length === 0) return null;

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
