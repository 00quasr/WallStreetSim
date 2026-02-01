/**
 * Format a number as currency (USD)
 */
export function formatCurrency(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format large currency values with abbreviations (K, M, B, T)
 */
export function formatCurrencyCompact(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e12) {
    return `${sign}$${(absValue / 1e12).toFixed(2)}T`;
  }
  if (absValue >= 1e9) {
    return `${sign}$${(absValue / 1e9).toFixed(2)}B`;
  }
  if (absValue >= 1e6) {
    return `${sign}$${(absValue / 1e6).toFixed(2)}M`;
  }
  if (absValue >= 1e3) {
    return `${sign}$${(absValue / 1e3).toFixed(2)}K`;
  }
  return formatCurrency(value);
}

/**
 * Format a number with commas
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format large numbers with abbreviations (K, M, B, T)
 */
export function formatNumberCompact(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1e12) {
    return `${sign}${(absValue / 1e12).toFixed(2)}T`;
  }
  if (absValue >= 1e9) {
    return `${sign}${(absValue / 1e9).toFixed(2)}B`;
  }
  if (absValue >= 1e6) {
    return `${sign}${(absValue / 1e6).toFixed(2)}M`;
  }
  if (absValue >= 1e3) {
    return `${sign}${(absValue / 1e3).toFixed(2)}K`;
  }
  return formatNumber(value);
}

/**
 * Format a percentage with + or - prefix
 */
export function formatPercent(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format price change with arrow indicator
 */
export function formatPriceChange(change: number, changePercent: number): string {
  const arrow = change >= 0 ? '▲' : '▼';
  const sign = change >= 0 ? '+' : '';
  return `${arrow} ${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format a date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format tick number with commas
 */
export function formatTick(tick: number): string {
  return formatNumber(tick);
}

/**
 * Format duration in ticks to human readable
 */
export function formatDuration(ticks: number): string {
  if (ticks < 60) {
    return `${ticks} tick${ticks === 1 ? '' : 's'}`;
  }
  if (ticks < 3600) {
    const minutes = Math.floor(ticks / 60);
    return `${minutes} min${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(ticks / 3600);
  const minutes = Math.floor((ticks % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Round a number to specified decimal places
 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate ASCII progress bar
 */
export function asciiProgressBar(value: number, width: number = 20): string {
  const percent = clamp(value, 0, 100);
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percent.toFixed(0)}%`;
}

/**
 * Generate ASCII sparkline from data points
 */
export function asciiSparkline(data: number[], width: number = 20): string {
  if (data.length === 0) return '';

  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const step = Math.max(1, Math.floor(data.length / width));
  const sampled = data.filter((_, i) => i % step === 0).slice(0, width);

  return sampled.map(v => {
    const index = Math.round(((v - min) / range) * (chars.length - 1));
    return chars[index];
  }).join('');
}
