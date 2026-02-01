'use client';

interface SparklineProps {
  data: number[];
  width?: number;
}

export function Sparkline({ data, width = 20 }: SparklineProps) {
  if (data.length === 0) return null;

  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

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
