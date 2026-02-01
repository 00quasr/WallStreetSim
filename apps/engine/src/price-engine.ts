import type { Company, Trade, PriceUpdate, MarketEvent, Sector, SectorData } from '@wallstreetsim/types';
import {
  gbmReturn,
  clamp,
  round,
  AGENT_PRESSURE_WEIGHT,
  RANDOM_WALK_WEIGHT,
  SECTOR_CORRELATION_WEIGHT,
  MAX_TICK_MOVE,
} from '@wallstreetsim/utils';

interface PriceEngineConfig {
  agentPressureWeight: number;
  randomWalkWeight: number;
  sectorCorrelationWeight: number;
  maxTickMove: number;
  minPrice: number;
}

const DEFAULT_CONFIG: PriceEngineConfig = {
  agentPressureWeight: AGENT_PRESSURE_WEIGHT,
  randomWalkWeight: RANDOM_WALK_WEIGHT,
  sectorCorrelationWeight: SECTOR_CORRELATION_WEIGHT,
  maxTickMove: MAX_TICK_MOVE,
  minPrice: 0.01,
};

export class PriceEngine {
  private companies: Map<string, Company> = new Map();
  private sectorData: Map<Sector, SectorData> = new Map();
  private activeEvents: MarketEvent[] = [];
  private config: PriceEngineConfig;
  private currentTick: number = 0;

  constructor(config: Partial<PriceEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize with companies and sector data
   */
  initialize(companies: Company[], sectorData: Map<Sector, SectorData>): void {
    for (const company of companies) {
      this.companies.set(company.symbol, { ...company });
    }
    this.sectorData = sectorData;
  }

  /**
   * Update sector data (can be refreshed periodically)
   */
  updateSectorData(sectorData: Map<Sector, SectorData>): void {
    this.sectorData = sectorData;
  }

  /**
   * Process a tick and update all prices
   */
  processTick(tick: number, trades: Trade[]): PriceUpdate[] {
    this.currentTick = tick;
    const updates: PriceUpdate[] = [];

    for (const [symbol, company] of this.companies) {
      const symbolTrades = trades.filter(t => t.symbol === symbol);
      const update = this.updatePrice(company, symbolTrades);
      updates.push(update);
    }

    // Decay active events
    this.activeEvents = this.activeEvents.filter(e =>
      tick < e.tick + e.duration
    );

    return updates;
  }

  /**
   * Calculate new price for a single stock
   */
  private updatePrice(company: Company, trades: Trade[]): PriceUpdate {
    const oldPrice = company.price;

    // 1. Agent pressure from trades
    const agentPressure = this.calculateAgentPressure(company, trades);

    // 2. Random walk (Geometric Brownian Motion)
    const randomWalk = gbmReturn(company.volatility, 0);

    // 3. Sector correlation
    const sectorMove = this.calculateSectorCorrelation(company);

    // 4. Event impact
    const eventImpact = this.calculateEventImpact(company);

    // Combine with weights
    const totalMove =
      (agentPressure * this.config.agentPressureWeight) +
      (randomWalk * this.config.randomWalkWeight) +
      (sectorMove * this.config.sectorCorrelationWeight) +
      eventImpact;

    // Clamp to max move
    const clampedMove = clamp(totalMove, -this.config.maxTickMove, this.config.maxTickMove);

    // Calculate new price
    let newPrice = oldPrice * (1 + clampedMove);
    newPrice = Math.max(this.config.minPrice, newPrice);
    newPrice = round(newPrice, 2);

    // Update company state
    company.previousClose = company.price;
    company.price = newPrice;
    company.high = Math.max(company.high, newPrice);
    company.low = Math.min(company.low, newPrice);

    // Update momentum (EMA of returns)
    const returnPct = (newPrice - oldPrice) / oldPrice;
    company.momentum = company.momentum * 0.9 + returnPct * 0.1;

    // Track manipulation
    if (Math.abs(agentPressure) > 0.02) {
      company.manipulationScore += Math.abs(agentPressure);
    }
    company.manipulationScore *= 0.99;

    const change = newPrice - oldPrice;
    const changePercent = (change / oldPrice) * 100;

    return {
      symbol: company.symbol,
      oldPrice,
      newPrice,
      change: round(change, 2),
      changePercent: round(changePercent, 2),
      volume: trades.reduce((sum, t) => sum + t.quantity, 0),
      tick: this.currentTick,
      drivers: {
        agentPressure: round(agentPressure * 100, 2),
        randomWalk: round(randomWalk * 100, 2),
        sectorCorrelation: round(sectorMove * 100, 2),
        eventImpact: round(eventImpact * 100, 2),
      },
    };
  }

  /**
   * Calculate price pressure from agent trading
   * Uses actual trade execution data for price discovery
   */
  private calculateAgentPressure(company: Company, trades: Trade[]): number {
    if (trades.length === 0) return 0;

    // Calculate buy and sell volumes from trades
    // A trade's price indicates market direction:
    // - Prices at or above mid suggest buyer aggression (lifting the ask)
    // - Prices below mid suggest seller aggression (hitting the bid)
    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of trades) {
      const tradeValue = trade.quantity * trade.price;
      // Use price vs current price to determine which side was aggressive
      if (trade.price >= company.price) {
        buyVolume += tradeValue;
      } else {
        sellVolume += tradeValue;
      }
    }

    // Calculate imbalance: positive = buy pressure, negative = sell pressure
    const totalVolume = buyVolume + sellVolume;
    const tradePressure = totalVolume > 0 ? (buyVolume - sellVolume) / totalVolume : 0;

    // Calculate volume impact
    const avgDailyVolume = company.sharesOutstanding * 0.01 * company.price;
    const volumeRatio = Math.min(1, totalVolume / (avgDailyVolume || 1));

    // Scale by volatility and volume
    return tradePressure * company.volatility * 10 * (0.5 + volumeRatio);
  }

  /**
   * Correlate stock movement with its sector
   */
  private calculateSectorCorrelation(company: Company): number {
    const sectorInfo = this.sectorData.get(company.sector);
    if (!sectorInfo) return 0;

    const sectorMove = sectorInfo.performance / 100;
    return sectorMove * company.beta * 0.5;
  }

  /**
   * Calculate impact of active events
   */
  private calculateEventImpact(company: Company): number {
    let totalImpact = 0;

    for (const event of this.activeEvents) {
      const affectsCompany = event.symbol === company.symbol;
      const affectsSector = event.sector === company.sector;

      if (!affectsCompany && !affectsSector) continue;

      // Decay impact over duration
      const ticksElapsed = this.currentTick - event.tick;
      const decayFactor = 1 - (ticksElapsed / event.duration);

      // Direct hit vs sector spillover
      const impactMultiplier = affectsCompany ? 1 : 0.3;

      totalImpact += event.impact * decayFactor * impactMultiplier;
    }

    return totalImpact * company.volatility * 5;
  }

  /**
   * Add a market event
   */
  triggerEvent(event: MarketEvent): void {
    this.activeEvents.push(event);
  }

  /**
   * Get a company by symbol
   */
  getCompany(symbol: string): Company | undefined {
    return this.companies.get(symbol);
  }

  /**
   * Get all companies
   */
  getAllCompanies(): Company[] {
    return Array.from(this.companies.values());
  }

  /**
   * Update company state (for syncing with DB)
   */
  updateCompany(symbol: string, updates: Partial<Company>): void {
    const company = this.companies.get(symbol);
    if (company) {
      Object.assign(company, updates);
    }
  }
}
