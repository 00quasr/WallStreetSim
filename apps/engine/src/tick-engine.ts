import { EventEmitter } from 'events';
import type { Company, Trade, PriceUpdate, MarketEvent, WorldState, SectorData, Sector, TickUpdate, Order, OrderType, OrderSide } from '@wallstreetsim/types';
import {
  TICK_INTERVAL_MS,
  MARKET_OPEN_TICK,
  MARKET_CLOSE_TICK,
  SECTOR_CONFIGS,
} from '@wallstreetsim/utils';
import { PriceEngine } from './price-engine';
import { MarketEngine } from './market-engine';
import { MarketMaker } from './market-maker';
import { EventGenerator } from './event-generator';
import * as dbService from './services/db';
import * as redisService from './services/redis';

interface TickEngineConfig {
  tickIntervalMs: number;
  marketOpenTick: number;
  marketCloseTick: number;
  enableEvents: boolean;
  eventChance: number;
}

const DEFAULT_CONFIG: TickEngineConfig = {
  tickIntervalMs: TICK_INTERVAL_MS,
  marketOpenTick: MARKET_OPEN_TICK,
  marketCloseTick: MARKET_CLOSE_TICK,
  enableEvents: true,
  eventChance: 0.005,
};

export class TickEngine extends EventEmitter {
  private config: TickEngineConfig;
  private priceEngine: PriceEngine;
  private marketEngine: MarketEngine;
  private marketMaker: MarketMaker;
  private eventGenerator: EventGenerator;

  private currentTick: number = 0;
  private marketOpen: boolean = true;
  private running: boolean = false;
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<TickEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.priceEngine = new PriceEngine();
    this.marketEngine = new MarketEngine();
    this.marketMaker = new MarketMaker();
    this.eventGenerator = new EventGenerator({
      baseEventChance: this.config.eventChance,
    });
  }

  /**
   * Initialize the engine with data from the database
   */
  async initialize(): Promise<void> {
    console.log('Initializing tick engine...');

    // Load world state
    const worldState = await dbService.getWorldState();
    if (worldState) {
      this.currentTick = worldState.currentTick;
      this.marketOpen = worldState.marketOpen;
      console.log(`  Loaded world state: tick=${this.currentTick}, marketOpen=${this.marketOpen}`);
    }

    // Load companies
    const companies = await dbService.getAllCompanies();
    console.log(`  Loaded ${companies.length} companies`);

    // Initialize sector data
    const sectorData = this.initializeSectorData();

    // Initialize engines
    this.priceEngine.initialize(companies, sectorData);
    this.marketEngine.initialize(companies.map(c => c.symbol));

    // Seed initial liquidity from market maker
    const liquidityOrders = this.marketMaker.generateLiquidityForAll(companies, this.currentTick);
    this.marketEngine.seedLiquidity(liquidityOrders);
    console.log(`  Seeded initial liquidity: ${liquidityOrders.length} orders`);

    // Sync tick to Redis
    await redisService.setCurrentTick(this.currentTick);

    console.log('Tick engine initialized');
  }

  /**
   * Initialize sector data from config
   */
  private initializeSectorData(): Map<Sector, SectorData> {
    const sectorData = new Map<Sector, SectorData>();

    for (const [sector, config] of Object.entries(SECTOR_CONFIGS)) {
      sectorData.set(sector as Sector, {
        sector: sector as Sector,
        performance: (Math.random() - 0.5) * 2, // -1% to +1% daily
        volatility: config.baseVolatility,
        correlation: config.marketCorrelation,
      });
    }

    return sectorData;
  }

  /**
   * Start the tick loop
   */
  start(): void {
    if (this.running) {
      console.log('Tick engine already running');
      return;
    }

    this.running = true;
    console.log(`Starting tick loop (${this.config.tickIntervalMs}ms interval)`);

    this.tickTimer = setInterval(() => {
      this.runTick().catch(err => {
        console.error('Tick error:', err);
        this.emit('error', err);
      });
    }, this.config.tickIntervalMs);

    this.emit('started');
  }

  /**
   * Stop the tick loop
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    console.log('Tick engine stopped');
    this.emit('stopped');
  }

  /**
   * Run a single tick
   */
  async runTick(): Promise<TickUpdate> {
    this.currentTick++;
    this.marketEngine.setTick(this.currentTick);

    // Check market hours
    const tickInDay = this.currentTick % (MARKET_CLOSE_TICK + 240); // 390 trading + 240 after hours
    const wasOpen = this.marketOpen;
    this.marketOpen = tickInDay >= this.config.marketOpenTick && tickInDay < this.config.marketCloseTick;

    if (wasOpen !== this.marketOpen) {
      await dbService.updateMarketOpen(this.marketOpen);
      this.emit('marketStatus', { open: this.marketOpen, tick: this.currentTick });
    }

    // Generate random events
    const events: MarketEvent[] = [];
    if (this.config.enableEvents && this.marketOpen) {
      const companies = this.priceEngine.getAllCompanies();
      const newEvents = this.eventGenerator.generateEvents(this.currentTick, companies);
      events.push(...newEvents);

      for (const event of newEvents) {
        this.priceEngine.triggerEvent(event);
        this.emit('event', event);
      }
    }

    // Process pending orders and match against order book
    const trades: Trade[] = [];
    if (this.marketOpen) {
      const matchedTrades = await this.processOrders();
      trades.push(...matchedTrades);
    }

    // Update prices
    const priceUpdates = this.priceEngine.processTick(this.currentTick, trades);

    // Persist price updates
    for (const update of priceUpdates) {
      const company = this.priceEngine.getCompany(update.symbol);
      if (company) {
        await dbService.updateCompanyPrice(
          update.symbol,
          update.newPrice,
          company.high,
          company.low,
          company.sentiment,
          company.manipulationScore
        );
        await redisService.cachePrice(update.symbol, update.newPrice);
      }
    }

    // Update world state
    await dbService.updateWorldTick(this.currentTick);
    await redisService.setCurrentTick(this.currentTick);

    // Create tick update
    const tickUpdate: TickUpdate = {
      tick: this.currentTick,
      timestamp: new Date(),
      marketOpen: this.marketOpen,
      regime: 'normal',
      priceUpdates,
      trades,
      events,
      news: [],
    };

    // Publish tick update to Redis
    await redisService.publish(redisService.CHANNELS.TICK_UPDATES, tickUpdate);

    // Emit tick event
    this.emit('tick', tickUpdate);

    return tickUpdate;
  }

  /**
   * Process pending orders from database and match against order book
   */
  private async processOrders(): Promise<Trade[]> {
    const allTrades: Trade[] = [];

    // Get symbols with pending orders
    const symbols = await dbService.getSymbolsWithPendingOrders();

    for (const symbol of symbols) {
      // Get pending orders for this symbol
      const pendingOrders = await dbService.getPendingOrders(symbol);

      for (const dbOrder of pendingOrders) {
        // Convert database order to Order type
        const order: Order = {
          id: dbOrder.id,
          agentId: dbOrder.agentId,
          symbol: dbOrder.symbol,
          side: dbOrder.side as OrderSide,
          type: dbOrder.orderType as OrderType,
          quantity: dbOrder.quantity,
          price: dbOrder.price ? parseFloat(dbOrder.price) : undefined,
          stopPrice: dbOrder.stopPrice ? parseFloat(dbOrder.stopPrice) : undefined,
          status: 'pending',
          filledQuantity: dbOrder.filledQuantity,
          avgFillPrice: dbOrder.avgFillPrice ? parseFloat(dbOrder.avgFillPrice) : undefined,
          tickSubmitted: dbOrder.tickSubmitted,
          tickFilled: dbOrder.tickFilled ?? undefined,
          createdAt: dbOrder.createdAt,
        };

        // Get current market price for market orders
        const company = this.priceEngine.getCompany(symbol);
        if (!company) continue;

        // For market orders, we use the current market price
        // For limit orders, use the order's specified price
        const { fills, remainingQuantity, affectedRestingOrders } = this.marketEngine.submitOrder(order);

        // Update status of resting orders that were affected by this fill
        for (const affectedOrder of affectedRestingOrders) {
          const restingStatus = affectedOrder.filledQuantity >= affectedOrder.totalQuantity
            ? 'filled'
            : 'partial';
          const tickFilled = restingStatus === 'filled' ? this.currentTick : null;
          await dbService.updateOrderStatus(
            affectedOrder.orderId,
            restingStatus,
            affectedOrder.filledQuantity,
            affectedOrder.avgFillPrice,
            tickFilled
          );
        }

        // Process fills
        for (const trade of fills) {
          // Insert trade into database
          await dbService.insertTrade({
            tick: trade.tick,
            symbol: trade.symbol,
            buyerId: trade.buyerId,
            sellerId: trade.sellerId,
            buyerOrderId: trade.buyerOrderId,
            sellerOrderId: trade.sellerOrderId,
            price: trade.price,
            quantity: trade.quantity,
          });

          // Update buyer's holdings (increase shares, decrease cash)
          await this.updateAgentPosition(
            trade.buyerId,
            trade.symbol,
            trade.quantity,
            trade.price,
            'BUY'
          );

          // Update seller's holdings (decrease shares, increase cash)
          await this.updateAgentPosition(
            trade.sellerId,
            trade.symbol,
            trade.quantity,
            trade.price,
            'SELL'
          );

          allTrades.push(trade);
        }

        // Calculate new filled quantity and average price
        const totalFilledQuantity = order.filledQuantity + (order.quantity - remainingQuantity);
        const fillQuantity = order.quantity - remainingQuantity;
        let newAvgFillPrice = order.avgFillPrice || 0;

        if (fillQuantity > 0 && fills.length > 0) {
          const fillValue = fills.reduce((sum, f) => sum + f.price * f.quantity, 0);
          const previousFillValue = (order.avgFillPrice || 0) * order.filledQuantity;
          newAvgFillPrice = (previousFillValue + fillValue) / totalFilledQuantity;
        }

        // Determine new order status
        // Orders are processed within 1-2 ticks:
        // - 'pending' -> 'open' (limit order added to book, waiting for match)
        // - 'pending' -> 'filled' (fully matched)
        // - 'pending' -> 'partial' (partially filled, remaining on book)
        let newStatus: string;
        if (remainingQuantity === 0) {
          newStatus = 'filled';
        } else if (totalFilledQuantity > 0) {
          newStatus = 'partial';
        } else if (order.type === 'LIMIT' && remainingQuantity > 0) {
          // Limit order with no fills - now resting on the order book
          newStatus = 'open';
        } else {
          // Market order with no fills (no liquidity available)
          newStatus = 'pending';
        }

        // Update order in database
        await dbService.updateOrderStatus(
          order.id,
          newStatus,
          totalFilledQuantity,
          newAvgFillPrice || null,
          newStatus === 'filled' ? this.currentTick : null
        );
      }
    }

    return allTrades;
  }

  /**
   * Update agent's position after a trade
   */
  private async updateAgentPosition(
    agentId: string,
    symbol: string,
    quantity: number,
    price: number,
    side: OrderSide
  ): Promise<void> {
    const tradeValue = quantity * price;
    const holding = await dbService.getHolding(agentId, symbol);

    if (side === 'BUY') {
      // Buying: increase shares, decrease cash
      const currentQuantity = holding?.quantity || 0;
      const currentCost = holding ? parseFloat(holding.averageCost) : 0;
      const currentValue = currentQuantity * currentCost;
      const newQuantity = currentQuantity + quantity;
      const newAverageCost = newQuantity > 0 ? (currentValue + tradeValue) / newQuantity : price;

      await dbService.updateHolding(agentId, symbol, quantity, newAverageCost);
      await dbService.updateAgentCash(agentId, -tradeValue);
    } else {
      // Selling: decrease shares, increase cash
      const currentQuantity = holding?.quantity || 0;
      const newQuantity = currentQuantity - quantity;

      if (newQuantity === 0 && holding) {
        // Position fully closed, delete the holding record
        await dbService.deleteHolding(agentId, symbol);
      } else {
        // Keep the average cost the same when selling
        const currentCost = holding ? parseFloat(holding.averageCost) : price;
        await dbService.updateHolding(agentId, symbol, -quantity, currentCost);
      }

      await dbService.updateAgentCash(agentId, tradeValue);
    }
  }

  /**
   * Get current tick
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Get market open status
   */
  isMarketOpen(): boolean {
    return this.marketOpen;
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get price engine instance
   */
  getPriceEngine(): PriceEngine {
    return this.priceEngine;
  }

  /**
   * Get market engine instance
   */
  getMarketEngine(): MarketEngine {
    return this.marketEngine;
  }

  /**
   * Manually trigger an event
   */
  triggerEvent(event: MarketEvent): void {
    this.priceEngine.triggerEvent(event);
    this.emit('event', event);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stop();
    await redisService.closeRedis();
    console.log('Tick engine shutdown complete');
  }
}
