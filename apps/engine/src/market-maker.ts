import type { Company, Order, OrderSide } from '@wallstreetsim/types';
import { generateUUID, round } from '@wallstreetsim/utils';

/**
 * Fixed UUID for the system market maker (deterministic for consistency)
 * This is a "virtual" agent that provides liquidity - not a real registered agent
 */
export const MARKET_MAKER_UUID = '00000000-0000-0000-0000-000000000001';

/**
 * Configuration for market maker liquidity provision
 */
export interface MarketMakerConfig {
  /** Market maker agent ID */
  agentId: string;
  /** Base spread as a percentage of price (e.g., 0.002 = 0.2%) */
  baseSpreadPercent: number;
  /** Number of price levels on each side */
  levels: number;
  /** Spread increment between levels (multiplier) */
  levelSpreadMultiplier: number;
  /** Base quantity at best bid/ask */
  baseQuantity: number;
  /** Quantity multiplier for deeper levels */
  levelQuantityMultiplier: number;
}

const DEFAULT_CONFIG: MarketMakerConfig = {
  agentId: MARKET_MAKER_UUID,
  baseSpreadPercent: 0.002, // 0.2% spread
  levels: 5, // 5 levels on each side
  levelSpreadMultiplier: 1.5, // Each level 1.5x further from mid
  baseQuantity: 1000, // 1000 shares at best
  levelQuantityMultiplier: 1.2, // 20% more at each level
};

/**
 * Market maker that provides initial liquidity to the order book
 *
 * Creates a symmetric order book around the current price with:
 * - Multiple price levels on each side
 * - Increasing spreads at deeper levels
 * - Increasing size at deeper levels (more liquidity away from mid)
 */
export class MarketMaker {
  private config: MarketMakerConfig;

  constructor(config: Partial<MarketMakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate initial liquidity orders for a company
   * Returns orders that should be added to the order book
   */
  generateInitialLiquidity(company: Company, tick: number): Order[] {
    const orders: Order[] = [];
    const midPrice = company.price;

    if (midPrice <= 0) {
      return orders;
    }

    // Adjust spread based on volatility - more volatile stocks need wider spreads
    const volatilityMultiplier = 1 + (company.volatility * 10);
    const adjustedSpread = this.config.baseSpreadPercent * volatilityMultiplier;

    // Generate bid orders (buy side)
    for (let level = 0; level < this.config.levels; level++) {
      const spreadFromMid = adjustedSpread * Math.pow(this.config.levelSpreadMultiplier, level);
      const bidPrice = round(midPrice * (1 - spreadFromMid), 2);
      const quantity = Math.floor(
        this.config.baseQuantity * Math.pow(this.config.levelQuantityMultiplier, level)
      );

      if (bidPrice > 0 && quantity > 0) {
        orders.push(this.createOrder(company.symbol, 'BUY', bidPrice, quantity, tick));
      }
    }

    // Generate ask orders (sell side)
    for (let level = 0; level < this.config.levels; level++) {
      const spreadFromMid = adjustedSpread * Math.pow(this.config.levelSpreadMultiplier, level);
      const askPrice = round(midPrice * (1 + spreadFromMid), 2);
      const quantity = Math.floor(
        this.config.baseQuantity * Math.pow(this.config.levelQuantityMultiplier, level)
      );

      if (quantity > 0) {
        orders.push(this.createOrder(company.symbol, 'SELL', askPrice, quantity, tick));
      }
    }

    return orders;
  }

  /**
   * Generate liquidity for multiple companies
   */
  generateLiquidityForAll(companies: Company[], tick: number): Order[] {
    const allOrders: Order[] = [];

    for (const company of companies) {
      const orders = this.generateInitialLiquidity(company, tick);
      allOrders.push(...orders);
    }

    return allOrders;
  }

  /**
   * Get the market maker agent ID
   */
  getAgentId(): string {
    return this.config.agentId;
  }

  /**
   * Create an order object
   */
  private createOrder(
    symbol: string,
    side: OrderSide,
    price: number,
    quantity: number,
    tick: number
  ): Order {
    return {
      id: generateUUID(),
      agentId: this.config.agentId,
      symbol,
      side,
      type: 'LIMIT',
      quantity,
      price,
      status: 'pending',
      filledQuantity: 0,
      tickSubmitted: tick,
      createdAt: new Date(),
    };
  }
}
