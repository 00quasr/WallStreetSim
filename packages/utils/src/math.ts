/**
 * Generate a random number from a normal distribution (Box-Muller transform)
 */
export function randomNormal(mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

/**
 * Calculate Geometric Brownian Motion return
 * GBM: dS = μSdt + σSdW
 * Returns the percentage change for one tick
 */
export function gbmReturn(
  volatility: number,
  drift: number = 0,
  dt: number = 1 / 390 // One tick = 1/390 of a trading day
): number {
  const z = randomNormal();
  return drift * dt + volatility * Math.sqrt(dt) * z;
}

/**
 * Calculate the new price using GBM
 */
export function gbmNextPrice(
  currentPrice: number,
  volatility: number,
  drift: number = 0,
  dt: number = 1 / 390
): number {
  const returnPct = gbmReturn(volatility, drift, dt);
  return currentPrice * (1 + returnPct);
}

/**
 * Calculate standard deviation of an array
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate returns from price series
 */
export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

/**
 * Calculate historical volatility from price series
 */
export function historicalVolatility(prices: number[], annualize: boolean = false): number {
  const returns = calculateReturns(prices);
  const vol = standardDeviation(returns);
  return annualize ? vol * Math.sqrt(252) : vol;
}

/**
 * Calculate exponential moving average
 */
export function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let emaValue = values[0];
  for (let i = 1; i < values.length; i++) {
    emaValue = (values[i] - emaValue) * multiplier + emaValue;
  }
  return emaValue;
}

/**
 * Calculate simple moving average
 */
export function sma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Calculate Relative Strength Index (RSI)
 */
export function rsi(prices: number[], period: number = 14): number {
  const returns = calculateReturns(prices);
  if (returns.length < period) return 50;

  const gains: number[] = [];
  const losses: number[] = [];

  for (const ret of returns.slice(-period)) {
    if (ret > 0) {
      gains.push(ret);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(ret));
    }
  }

  const avgGain = sma(gains, period);
  const avgLoss = sma(losses, period);

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate order book imbalance
 * Returns -1 (all sells) to 1 (all buys)
 */
export function orderBookImbalance(bidVolume: number, askVolume: number): number {
  const total = bidVolume + askVolume;
  if (total === 0) return 0;
  return (bidVolume - askVolume) / total;
}

/**
 * Calculate trade imbalance from recent trades
 * Returns -1 (all sells) to 1 (all buys)
 */
export function tradeImbalance(
  trades: Array<{ price: number; quantity: number }>,
  midPrice: number
): number {
  let buyVolume = 0;
  let sellVolume = 0;

  for (const trade of trades) {
    if (trade.price >= midPrice) {
      buyVolume += trade.quantity * trade.price;
    } else {
      sellVolume += trade.quantity * trade.price;
    }
  }

  const total = buyVolume + sellVolume;
  if (total === 0) return 0;
  return (buyVolume - sellVolume) / total;
}

/**
 * Calculate price impact based on order size and liquidity
 */
export function priceImpact(
  orderSize: number,
  avgDailyVolume: number,
  volatility: number
): number {
  const volumeRatio = orderSize / (avgDailyVolume || 1);
  return Math.min(1, volumeRatio) * volatility * 10;
}

/**
 * Weighted random selection from array
 */
export function weightedRandom<T>(items: T[], weights: number[]): T {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

/**
 * Linear interpolation
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to specified decimal places
 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate compound annual growth rate
 */
export function cagr(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Calculate Sharpe ratio
 */
export function sharpeRatio(
  returns: number[],
  riskFreeRate: number = 0.05
): number {
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = standardDeviation(returns);
  if (stdDev === 0) return 0;
  return (avgReturn - riskFreeRate / 252) / stdDev;
}

/**
 * Calculate maximum drawdown
 */
export function maxDrawdown(values: number[]): number {
  let peak = values[0];
  let maxDd = 0;

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }
    const drawdown = (peak - value) / peak;
    if (drawdown > maxDd) {
      maxDd = drawdown;
    }
  }

  return maxDd;
}
