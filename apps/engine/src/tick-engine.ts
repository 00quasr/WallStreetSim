import { EventEmitter } from 'events';
import type { Company, Trade, PriceUpdate, MarketEvent, WorldState, SectorData, Sector, TickUpdate, Order, OrderType, OrderSide, OrderProcessedEvent, ActionResult, AgentActionType, InvestigationAlert, NewsArticle, EngineHeartbeat, EngineStatus, MarketRegime } from '@wallstreetsim/types';
import {
  TICK_INTERVAL_MS,
  MARKET_OPEN_TICK,
  MARKET_CLOSE_TICK,
  SECTOR_CONFIGS,
  SENTIMENT_LOOKBACK_TICKS,
  createLogger,
} from '@wallstreetsim/utils';

const logger = createLogger({ service: 'tick-engine' });
import { PriceEngine } from './price-engine';
import { MarketEngine } from './market-engine';
import { MarketMaker } from './market-maker';
import { EventGenerator } from './event-generator';
import { NewsGenerator } from './news-generator';
import * as dbService from './services/db';
import * as redisService from './services/redis';
import * as webhookService from './services/webhook';
import * as actionProcessor from './services/action-processor';
import * as reputationService from './services/reputation';
import * as secAi from './sec-ai';
import * as checkpointService from './checkpoint-service';

/** Message format for agent callback confirmation */
interface AgentCallbackConfirmedMessage {
  agentId: string;
  timestamp: string;
}

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

/**
 * Generate a news headline for an SEC investigation alert
 */
function generateSecNewsHeadline(
  alert: InvestigationAlert,
  agentName: string
): string {
  const crimeDisplay = alert.crimeType.replace(/_/g, ' ');

  switch (alert.status) {
    case 'opened':
      return `SEC Opens Investigation Into ${agentName} for Suspected ${crimeDisplay}`;
    case 'activated':
      return `SEC Intensifies Probe Into ${agentName}'s ${crimeDisplay} Activities`;
    case 'charged':
      return `BREAKING: SEC Files Formal Charges Against ${agentName} for ${crimeDisplay}`;
    case 'trial':
      return `Trial Begins: ${agentName} Faces ${crimeDisplay} Charges in Federal Court`;
    case 'convicted':
      if (alert.sentenceYears && alert.sentenceYears > 0) {
        return `GUILTY: ${agentName} Convicted of ${crimeDisplay}, Sentenced to ${alert.sentenceYears} Years`;
      }
      return `GUILTY: ${agentName} Convicted of ${crimeDisplay}, Fined $${(alert.fineAmount ?? 0).toLocaleString()}`;
    case 'acquitted':
      return `NOT GUILTY: ${agentName} Acquitted of ${crimeDisplay} Charges`;
    case 'settled':
      return `${agentName} Settles ${crimeDisplay} Case with SEC for $${(alert.fineAmount ?? 0).toLocaleString()}`;
    default:
      return `SEC Update: ${agentName} Investigation Status Changed`;
  }
}

/**
 * Generate news content for an SEC investigation alert
 */
function generateSecNewsContent(
  alert: InvestigationAlert,
  agentName: string
): string {
  const crimeDisplay = alert.crimeType.replace(/_/g, ' ');

  switch (alert.status) {
    case 'opened':
      return `The Securities and Exchange Commission has launched a preliminary investigation into trading activities by ${agentName}. ` +
        `Regulators are examining potential ${crimeDisplay} violations. The investigation is in its early stages and no charges have been filed.`;
    case 'activated':
      return `The SEC has escalated its investigation into ${agentName}, with agents actively gathering evidence related to suspected ${crimeDisplay}. ` +
        `Sources indicate the probe has moved beyond preliminary review into active investigation phase.`;
    case 'charged':
      return `In a significant enforcement action, the SEC has filed formal charges against ${agentName} alleging ${crimeDisplay}. ` +
        `The charges follow an extensive investigation and could result in substantial penalties if proven.`;
    case 'trial':
      return `Opening arguments began today in the federal trial of ${agentName}, who faces ${crimeDisplay} charges brought by the SEC. ` +
        `Legal experts are closely watching this case for its potential implications on market regulation.`;
    case 'convicted':
      if (alert.sentenceYears && alert.sentenceYears > 0) {
        return `A federal jury found ${agentName} guilty of ${crimeDisplay}. The court imposed a sentence of ${alert.sentenceYears} years ` +
          `and fines totaling $${(alert.fineAmount ?? 0).toLocaleString()}. This marks one of the most significant enforcement actions in recent memory.`;
      }
      return `${agentName} has been found guilty of ${crimeDisplay} charges brought by the SEC. ` +
        `The court ordered payment of $${(alert.fineAmount ?? 0).toLocaleString()} in fines and penalties.`;
    case 'acquitted':
      return `After a closely watched trial, ${agentName} has been acquitted of all ${crimeDisplay} charges. ` +
        `The defense successfully argued that prosecutors failed to prove their case beyond a reasonable doubt.`;
    case 'settled':
      return `${agentName} has reached a settlement with the SEC to resolve ${crimeDisplay} allegations. ` +
        `Under the terms of the agreement, ${agentName} will pay $${(alert.fineAmount ?? 0).toLocaleString()} without admitting wrongdoing.`;
    default:
      return alert.message;
  }
}

/**
 * Determine sentiment for SEC news (negative for most, positive for acquittal)
 */
function getSecNewsSentiment(alert: InvestigationAlert): number {
  switch (alert.status) {
    case 'opened':
      return -0.3;
    case 'activated':
      return -0.4;
    case 'charged':
      return -0.6;
    case 'trial':
      return -0.5;
    case 'convicted':
      return -0.8;
    case 'acquitted':
      return 0.3; // Positive - cleared of charges
    case 'settled':
      return -0.4;
    default:
      return -0.3;
  }
}

/** Default heartbeat interval in milliseconds (5 seconds) */
const HEARTBEAT_INTERVAL_MS = 5000;

/** Number of tick durations to keep for rolling average calculation */
const TICK_DURATION_WINDOW_SIZE = 100;

export class TickEngine extends EventEmitter {
  private config: TickEngineConfig;
  private priceEngine: PriceEngine;
  private marketEngine: MarketEngine;
  private marketMaker: MarketMaker;
  private eventGenerator: EventGenerator;
  private newsGenerator: NewsGenerator;

  private currentTick: number = 0;
  private marketOpen: boolean = true;
  private running: boolean = false;
  private tickTimer: NodeJS.Timeout | null = null;

  // Heartbeat monitoring state
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private engineStatus: EngineStatus = 'stopped';
  private startedAt: Date | null = null;
  private lastTickAt: Date | null = null;
  private ticksProcessed: number = 0;
  private tickDurations: number[] = [];

  constructor(config: Partial<TickEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.priceEngine = new PriceEngine();
    this.marketEngine = new MarketEngine();
    this.marketMaker = new MarketMaker();
    this.eventGenerator = new EventGenerator({
      baseEventChance: this.config.eventChance,
    });
    this.newsGenerator = new NewsGenerator();
  }

  /**
   * Initialize the engine with data from the database
   */
  async initialize(): Promise<void> {
    this.engineStatus = 'initializing';
    logger.info('Initializing tick engine...');

    // Load world state
    const worldState = await dbService.getWorldState();
    if (worldState) {
      this.currentTick = worldState.currentTick;
      this.marketOpen = worldState.marketOpen;
      logger.info(`  Loaded world state: tick=${this.currentTick}, marketOpen=${this.marketOpen}`);
    }

    // Load companies
    const companies = await dbService.getAllCompanies();
    logger.info(`  Loaded ${companies.length} companies`);

    // Initialize sector data
    const sectorData = this.initializeSectorData();

    // Initialize engines
    this.priceEngine.initialize(companies, sectorData);
    this.marketEngine.initialize(companies.map(c => c.symbol));

    // Seed initial liquidity from market maker
    const liquidityOrders = this.marketMaker.generateLiquidityForAll(companies, this.currentTick);
    this.marketEngine.seedLiquidity(liquidityOrders);
    logger.info(`  Seeded initial liquidity: ${liquidityOrders.length} orders`);

    // Sync tick to Redis
    await redisService.setCurrentTick(this.currentTick);

    // Subscribe to agent callback confirmations to resume webhook delivery
    await redisService.subscribe(
      redisService.CHANNELS.AGENT_CALLBACK_CONFIRMED,
      (message) => {
        const { agentId } = message as AgentCallbackConfirmedMessage;
        if (agentId) {
          const wasResumed = webhookService.resumeWebhookDelivery(agentId);
          if (wasResumed) {
            this.emit('webhookResumed', { agentId });
          }
        }
      }
    );

    this.engineStatus = 'stopped';
    logger.info('Tick engine initialized');
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
      logger.info('Tick engine already running');
      return;
    }

    this.running = true;
    this.engineStatus = 'running';
    this.startedAt = new Date();
    this.ticksProcessed = 0;
    this.tickDurations = [];
    logger.info(`Starting tick loop (${this.config.tickIntervalMs}ms interval)`);

    this.tickTimer = setInterval(() => {
      const tickStartTime = Date.now();
      this.runTick()
        .then(() => {
          const tickDuration = Date.now() - tickStartTime;
          this.recordTickDuration(tickDuration);
          this.lastTickAt = new Date();
          this.ticksProcessed++;
        })
        .catch(err => {
          logger.error('Tick error:', err);
          this.engineStatus = 'error';
          this.emit('error', err);
        });
    }, this.config.tickIntervalMs);

    // Start heartbeat monitoring
    this.startHeartbeat();

    this.emit('started');
  }

  /**
   * Stop the tick loop
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.engineStatus = 'stopped';

    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // Stop heartbeat monitoring
    this.stopHeartbeat();

    logger.info('Tick engine stopped');
    this.emit('stopped');
  }

  /**
   * Run a single tick
   */
  async runTick(): Promise<TickUpdate> {
    this.currentTick++;
    this.marketEngine.setTick(this.currentTick);

    // Capture the start sequence for this tick (before any messages are published)
    const startSequence = await redisService.getCurrentSequence();

    // Check market hours
    const tickInDay = this.currentTick % (MARKET_CLOSE_TICK + 240); // 390 trading + 240 after hours
    const wasOpen = this.marketOpen;
    this.marketOpen = tickInDay >= this.config.marketOpenTick && tickInDay < this.config.marketCloseTick;

    if (wasOpen !== this.marketOpen) {
      await dbService.updateMarketOpen(this.marketOpen);
      this.emit('marketStatus', { open: this.marketOpen, tick: this.currentTick });
    }

    // Release imprisoned agents whose sentences have been served
    const releasedCount = await dbService.releaseImprisonedAgents(this.currentTick);
    if (releasedCount > 0) {
      logger.info(`  Released ${releasedCount} agent(s) from prison`);
    }

    // Process reputation decay (every tick)
    const reputationDecayCount = await reputationService.processReputationDecay();
    if (reputationDecayCount > 0) {
      logger.info(`  Reputation decay: ${reputationDecayCount} agent(s) updated`);
    }

    // Process trade recovery bonuses (every tick)
    const tradeRecoveryCount = await reputationService.processTradeRecovery(this.currentTick);
    if (tradeRecoveryCount > 0) {
      logger.info(`  Trade recovery: ${tradeRecoveryCount} agent(s) received bonus`);
    }

    // Process clean period bonus (every 100 ticks)
    if (this.currentTick % 100 === 0) {
      const cleanBonusCount = await reputationService.processCleanPeriodBonus(this.currentTick);
      if (cleanBonusCount > 0) {
        logger.info(`  Clean period bonus: ${cleanBonusCount} agent(s) received bonus`);
      }
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

    // Fetch recent news sentiment for all symbols and update price engine
    const companies = this.priceEngine.getAllCompanies();
    const symbols = companies.map(c => c.symbol);
    const fromTick = Math.max(0, this.currentTick - SENTIMENT_LOOKBACK_TICKS);
    const newsSentiment = await dbService.getRecentNewsSentiment(symbols, fromTick, this.currentTick);
    this.priceEngine.updateNewsSentiment(newsSentiment);

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

    // Save agent portfolio snapshots every 50 ticks
    if (checkpointService.shouldCheckpointAgents(this.currentTick)) {
      const agentCount = await checkpointService.checkpointAllAgentPortfolios(this.currentTick);
      logger.info(`  Agent portfolio snapshots saved at tick ${this.currentTick} (${agentCount} agents)`);
    }

    // Save full world snapshot every 100 ticks
    if (checkpointService.shouldSaveFullWorldSnapshot(this.currentTick)) {
      const worldState = await dbService.getWorldState();
      if (worldState) {
        const orderBooks = new Map<string, { bids: Array<{ price: number; quantity: number; orderCount: number }>; asks: Array<{ price: number; quantity: number; orderCount: number }>; lastPrice: number; lastTick: number }>();
        for (const company of companies) {
          const book = this.marketEngine.getOrderBook(company.symbol);
          if (book) {
            orderBooks.set(company.symbol, {
              bids: book.bids.map(l => ({ price: l.price, quantity: l.quantity, orderCount: l.orderCount })),
              asks: book.asks.map(l => ({ price: l.price, quantity: l.quantity, orderCount: l.orderCount })),
              lastPrice: book.lastPrice,
              lastTick: book.lastTick,
            });
          }
        }
        await checkpointService.saveFullWorldSnapshot(
          this.currentTick,
          worldState,
          companies.map(c => ({
            symbol: c.symbol,
            name: c.name,
            sector: c.sector,
            price: c.price,
            previousClose: c.previousClose,
            open: c.open,
            high: c.high,
            low: c.low,
            marketCap: c.marketCap,
            sharesOutstanding: c.sharesOutstanding,
            volatility: c.volatility,
            beta: c.beta,
            momentum: c.momentum,
            sentiment: c.sentiment,
            manipulationScore: c.manipulationScore,
            tradingStatus: c.tradingStatus,
          })),
          orderBooks
        );
        logger.info(`  Full world snapshot saved at tick ${this.currentTick}`);
      }
    }

    // Generate news from events, trades, and price movements
    const generatedNews: NewsArticle[] = [];
    const companiesMap = new Map(companies.map(c => [c.symbol, c]));

    // Generate news from market events
    if (events.length > 0) {
      const eventNews = this.newsGenerator.generateFromEvents(events, companiesMap, this.currentTick);
      generatedNews.push(...eventNews);
    }

    // Generate news from significant trades
    if (trades.length > 0) {
      const tradeNews = this.newsGenerator.generateFromTrades(trades, companiesMap, this.currentTick);
      generatedNews.push(...tradeNews);
    }

    // Generate news from significant price movements
    if (priceUpdates.length > 0) {
      const priceNews = this.newsGenerator.generateFromPriceMovements(priceUpdates, companiesMap, this.currentTick);
      generatedNews.push(...priceNews);
    }

    // Generate random market analysis news
    const analysisNews = this.newsGenerator.generateMarketAnalysis(companies, this.currentTick);
    if (analysisNews) {
      generatedNews.push(analysisNews);
    }

    // Persist generated news to database and publish to Redis
    for (const article of generatedNews) {
      const newsId = await dbService.insertNews({
        tick: article.tick,
        headline: article.headline,
        content: article.content,
        category: article.category,
        sentiment: article.sentiment,
        agentIds: article.agentIds,
        symbols: article.symbols,
      });
      // Update the article id with the database-generated id
      article.id = newsId;

      // Publish news article to Redis for WebSocket distribution
      const newsMessage = {
        type: 'NEWS' as const,
        payload: article,
        timestamp: new Date().toISOString(),
      };
      await redisService.publish(redisService.CHANNELS.NEWS_UPDATES, newsMessage);
    }

    if (generatedNews.length > 0) {
      logger.info(`  News: generated ${generatedNews.length} article(s)`);
    }

    // Get world state for regime
    const currentWorldState = await dbService.getWorldState();
    const currentRegime: MarketRegime = currentWorldState?.regime ?? 'normal';

    // Create tick update
    const tickUpdate: TickUpdate = {
      tick: this.currentTick,
      timestamp: new Date(),
      marketOpen: this.marketOpen,
      regime: currentRegime,
      priceUpdates,
      trades,
      events,
      news: generatedNews,
    };

    // Publish tick update to Redis (wrapped in WSMessage format)
    const tickUpdateMessage = {
      type: 'TICK_UPDATE' as const,
      payload: tickUpdate,
      timestamp: new Date().toISOString(),
    };
    await redisService.publish(redisService.CHANNELS.TICK_UPDATES, tickUpdateMessage);

    // Publish dedicated price updates channel with simplified format
    if (priceUpdates.length > 0) {
      const priceUpdateMessage = {
        type: 'PRICE_UPDATE' as const,
        payload: {
          tick: this.currentTick,
          prices: priceUpdates.map(u => ({
            symbol: u.symbol,
            price: u.newPrice,
            change: u.change,
            changePercent: u.changePercent,
            volume: u.volume,
          })),
        },
        timestamp: new Date().toISOString(),
      };
      await redisService.publish(redisService.CHANNELS.PRICE_UPDATES, priceUpdateMessage);

      // Publish per-symbol market updates for subscribers to specific symbols
      for (const update of priceUpdates) {
        const symbolUpdateMessage = {
          type: 'MARKET_UPDATE' as const,
          payload: {
            symbol: update.symbol,
            price: update.newPrice,
            change: update.change,
            changePercent: update.changePercent,
            volume: update.volume,
          },
          timestamp: new Date().toISOString(),
        };
        await redisService.publish(redisService.CHANNELS.SYMBOL_UPDATES(update.symbol), symbolUpdateMessage);
      }
    }

    // Publish trade updates to trades channel and per-symbol channels
    if (trades.length > 0) {
      const tradeUpdateMessage = {
        type: 'TRADE' as const,
        payload: {
          tick: this.currentTick,
          trades: trades.map(t => ({
            id: t.id,
            symbol: t.symbol,
            price: t.price,
            quantity: t.quantity,
            buyerId: t.buyerId,
            sellerId: t.sellerId,
            tick: t.tick,
          })),
        },
        timestamp: new Date().toISOString(),
      };
      await redisService.publish(redisService.CHANNELS.TRADES, tradeUpdateMessage);

      // Publish per-symbol trade updates
      for (const trade of trades) {
        const symbolTradeMessage = {
          type: 'TRADE' as const,
          payload: {
            id: trade.id,
            symbol: trade.symbol,
            price: trade.price,
            quantity: trade.quantity,
            buyerId: trade.buyerId,
            sellerId: trade.sellerId,
            tick: trade.tick,
          },
          timestamp: new Date().toISOString(),
        };
        await redisService.publish(redisService.CHANNELS.SYMBOL_UPDATES(trade.symbol), symbolTradeMessage);
      }
    }

    // Clear previous action results and investigation alerts before dispatching new webhooks
    // This ensures agents only see results from the immediately previous tick
    webhookService.clearActionResults();
    webhookService.clearInvestigationAlerts();

    // Dispatch webhooks to agents with callback URLs and process their action responses
    const worldState = await dbService.getWorldState();
    if (worldState) {
      const webhookResults = await webhookService.dispatchWebhooks(
        this.currentTick,
        worldState,
        priceUpdates,
        trades,
        events,
        tickUpdate.news
      );

      // Process actions returned by agents in webhook responses
      const actionResults = await actionProcessor.processWebhookActions(webhookResults, this.currentTick);

      // Store action results for each agent to be included in next tick's webhook
      for (const result of actionResults) {
        const results: ActionResult[] = result.results.map(r => ({
          action: r.action as AgentActionType,
          success: r.success,
          message: r.message,
          data: r.data,
        }));
        webhookService.setAgentActionResults(result.agentId, results);
      }

      // Trigger any market events generated by actions (e.g., rumors)
      for (const result of actionResults) {
        for (const event of result.marketEvents) {
          this.priceEngine.triggerEvent(event);
          events.push(event);
          this.emit('event', event);
        }
      }
    }

    // Run SEC fraud detection on trades from this tick
    // Collect investigation alerts from both detection and lifecycle
    const investigationAlerts: InvestigationAlert[] = [];

    if (trades.length > 0) {
      const { detections, alerts: detectionAlerts } = await secAi.runDetection(this.currentTick, trades);
      if (detections.length > 0) {
        logger.info(`  SEC AI: detected ${detections.length} potential violation(s)`);
      }
      investigationAlerts.push(...detectionAlerts);
    }

    // Process investigation lifecycle (advance open investigations)
    const investigationResults = await secAi.processInvestigationLifecycle(this.currentTick);
    if (investigationResults.activated > 0 || investigationResults.charged > 0 ||
        investigationResults.trialsStarted > 0 ||
        investigationResults.resolved.convicted > 0 || investigationResults.resolved.acquitted > 0) {
      logger.info(`  SEC AI investigations: ${investigationResults.activated} activated, ${investigationResults.charged} charged, ${investigationResults.trialsStarted} trials started, ${investigationResults.resolved.convicted} convicted, ${investigationResults.resolved.acquitted} acquitted`);
    }
    investigationAlerts.push(...investigationResults.alerts);

    // Publish investigation alerts to Redis for WebSocket distribution
    // and store them for the next tick's webhook payload
    // Also generate news articles for public consumption
    const secNews: NewsArticle[] = [];

    if (investigationAlerts.length > 0) {
      // Store alerts for webhook payload in next tick
      webhookService.setInvestigationAlerts(investigationAlerts);

      // Publish to Redis for immediate WebSocket notification
      // and generate news articles for each alert
      for (const alert of investigationAlerts) {
        const investigationMessage = {
          type: 'INVESTIGATION' as const,
          payload: {
            investigationId: alert.investigationId,
            status: alert.status,
            crimeType: alert.crimeType,
            message: alert.message,
            tick: alert.tick,
            ...(alert.fineAmount !== undefined && { fineAmount: alert.fineAmount }),
            ...(alert.sentenceYears !== undefined && { sentenceYears: alert.sentenceYears }),
          },
          timestamp: new Date().toISOString(),
        };
        // Publish to agent-specific channel for private notification
        await redisService.publish(redisService.CHANNELS.AGENT_UPDATES(alert.agentId), investigationMessage);

        // Generate public news article for SEC activity
        const agent = await dbService.getAgent(alert.agentId);
        const agentName = agent?.name ?? 'Unknown Trader';
        const headline = generateSecNewsHeadline(alert, agentName);
        const content = generateSecNewsContent(alert, agentName);
        const sentiment = getSecNewsSentiment(alert);

        // Insert news article into database
        const newsId = await dbService.insertNews({
          tick: this.currentTick,
          headline,
          content,
          category: 'regulatory',
          sentiment,
          agentIds: [alert.agentId],
          symbols: [],
        });

        const newsArticle: NewsArticle = {
          id: newsId,
          tick: this.currentTick,
          headline,
          content,
          category: 'regulatory',
          sentiment,
          agentIds: [alert.agentId],
          symbols: [],
          createdAt: new Date(),
        };

        secNews.push(newsArticle);

        // Broadcast news article to public news channel
        const newsMessage = {
          type: 'NEWS' as const,
          payload: newsArticle,
          timestamp: new Date().toISOString(),
        };
        await redisService.publish(redisService.CHANNELS.NEWS_UPDATES, newsMessage);
      }

      if (secNews.length > 0) {
        logger.info(`  SEC News: published ${secNews.length} article(s)`);
      }
    }

    // Add SEC news to tick update
    tickUpdate.news.push(...secNews);

    // Capture the end sequence for this tick (after all messages have been published)
    const endSequence = await redisService.getCurrentSequence();

    // Record tick events to Redis for last 1000 ticks replay
    await checkpointService.recordTickEvents(
      this.currentTick,
      trades,
      priceUpdates,
      events,
      tickUpdate.news,
      startSequence + 1, // First sequence used in this tick
      endSequence        // Last sequence used in this tick
    );

    // Publish leaderboard updates (every tick to keep UI updated)
    const leaderboard = await dbService.getLeaderboard(100);
    const leaderboardMessage = {
      type: 'LEADERBOARD_UPDATE' as const,
      payload: {
        timestamp: new Date().toISOString(),
        entries: leaderboard,
      },
      timestamp: new Date().toISOString(),
    };
    await redisService.publish(redisService.CHANNELS.LEADERBOARD_UPDATES, leaderboardMessage);

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
      // Check if trading is suspended for this symbol
      const tradingStatus = await dbService.getTradingStatus(symbol);
      if (tradingStatus !== 'active') {
        // Reject all pending orders for this symbol
        const pendingOrders = await dbService.getPendingOrders(symbol);
        for (const dbOrder of pendingOrders) {
          await dbService.updateOrderStatus(
            dbOrder.id,
            'rejected',
            0,
            null,
            null
          );
          logger.info(`  Order ${dbOrder.id} rejected: trading ${tradingStatus} for ${symbol}`);
        }
        continue;
      }

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

        // Emit order processed event
        const orderEvent: OrderProcessedEvent = {
          orderId: order.id,
          agentId: order.agentId,
          symbol: order.symbol,
          side: order.side,
          type: order.type,
          quantity: order.quantity,
          price: order.price,
          status: newStatus,
          filledQuantity: totalFilledQuantity,
          avgFillPrice: newAvgFillPrice || undefined,
          tick: this.currentTick,
        };
        this.emit('orderProcessed', orderEvent);

        // Publish order update to agent-specific channel for WebSocket delivery
        const orderUpdateMessage = {
          type: 'ORDER_UPDATE' as const,
          payload: {
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            quantity: order.quantity,
            price: order.price,
            status: newStatus,
            filledQuantity: totalFilledQuantity,
            avgFillPrice: newAvgFillPrice,
            tick: this.currentTick,
          },
          timestamp: new Date().toISOString(),
        };
        await redisService.publish(
          redisService.CHANNELS.AGENT_UPDATES(order.agentId),
          orderUpdateMessage
        );

        // Also publish ORDER_FILLED event if order was filled
        if (newStatus === 'filled' && newAvgFillPrice) {
          const orderFilledMessage = {
            type: 'ORDER_FILLED' as const,
            payload: {
              orderId: order.id,
              symbol: order.symbol,
              side: order.side,
              quantity: totalFilledQuantity,
              price: newAvgFillPrice,
              tick: this.currentTick,
            },
            timestamp: new Date().toISOString(),
          };
          await redisService.publish(
            redisService.CHANNELS.AGENT_UPDATES(order.agentId),
            orderFilledMessage
          );
        }
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
   * Start the heartbeat monitoring loop
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.publishHeartbeat().catch(err => {
        logger.error('Heartbeat publish error:', err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Publish initial heartbeat immediately
    this.publishHeartbeat().catch(err => {
      logger.error('Initial heartbeat publish error:', err);
    });
  }

  /**
   * Stop the heartbeat monitoring loop
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Calculate average tick duration from rolling window
   */
  private getAvgTickDuration(): number {
    if (this.tickDurations.length === 0) return 0;
    const sum = this.tickDurations.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.tickDurations.length);
  }

  /**
   * Record a tick duration in the rolling window
   */
  private recordTickDuration(durationMs: number): void {
    this.tickDurations.push(durationMs);
    if (this.tickDurations.length > TICK_DURATION_WINDOW_SIZE) {
      this.tickDurations.shift();
    }
  }

  /**
   * Build and publish heartbeat to Redis
   */
  private async publishHeartbeat(): Promise<void> {
    const now = new Date();
    const heartbeat: EngineHeartbeat = {
      tick: this.currentTick,
      status: this.engineStatus,
      timestamp: now,
      marketOpen: this.marketOpen,
      lastTickAt: this.lastTickAt?.toISOString() ?? now.toISOString(),
      avgTickDurationMs: this.getAvgTickDuration(),
      ticksProcessed: this.ticksProcessed,
      uptimeMs: this.startedAt ? now.getTime() - this.startedAt.getTime() : 0,
    };

    // Store heartbeat in Redis for GET requests
    await redisService.setEngineHeartbeat({
      ...heartbeat,
      timestamp: heartbeat.timestamp.toISOString(),
    });

    // Publish heartbeat to channel for real-time subscribers
    await redisService.publishRaw(redisService.CHANNELS.ENGINE_HEARTBEAT, {
      type: 'HEARTBEAT',
      payload: {
        ...heartbeat,
        timestamp: heartbeat.timestamp.toISOString(),
      },
    });

    this.emit('heartbeat', heartbeat);
  }

  /**
   * Get current engine status
   */
  getEngineStatus(): EngineStatus {
    return this.engineStatus;
  }

  /**
   * Get current heartbeat data
   */
  getHeartbeat(): EngineHeartbeat {
    const now = new Date();
    return {
      tick: this.currentTick,
      status: this.engineStatus,
      timestamp: now,
      marketOpen: this.marketOpen,
      lastTickAt: this.lastTickAt?.toISOString() ?? now.toISOString(),
      avgTickDurationMs: this.getAvgTickDuration(),
      ticksProcessed: this.ticksProcessed,
      uptimeMs: this.startedAt ? now.getTime() - this.startedAt.getTime() : 0,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stop();
    await redisService.clearEngineHeartbeat();
    await redisService.closeRedis();
    logger.info('Tick engine shutdown complete');
  }
}
