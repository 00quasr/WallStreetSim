import type { Sector } from './company';

export type EventType =
  | 'EARNINGS_BEAT'
  | 'EARNINGS_MISS'
  | 'CEO_SCANDAL'
  | 'PRODUCT_LAUNCH'
  | 'FDA_APPROVAL'
  | 'FDA_REJECTION'
  | 'MERGER_RUMOR'
  | 'INSIDER_SELLING'
  | 'SHORT_SQUEEZE'
  | 'ANALYST_UPGRADE'
  | 'ANALYST_DOWNGRADE'
  | 'SECTOR_ROTATION'
  | 'BLACK_SWAN'
  | 'MEME_PUMP'
  | 'MARKET_CRASH'
  | 'RALLY'
  | 'RUMOR'
  // Price movement events
  | 'FLASH_CRASH'
  | 'DEAD_CAT_BOUNCE'
  | 'VOLATILE_SESSION'
  | 'BULL_RUN'
  | 'BEAR_RAID'
  | 'GAP_UP'
  | 'GAP_DOWN'
  | 'BREAKOUT'
  | 'BREAKDOWN'
  | 'CONSOLIDATION'
  | 'MOMENTUM_SHIFT'
  // Company-specific events
  | 'DIVIDEND_DECLARED'
  | 'DIVIDEND_CUT'
  | 'STOCK_BUYBACK'
  | 'EXECUTIVE_DEPARTURE'
  | 'EXECUTIVE_HIRED'
  | 'LAYOFFS'
  | 'EXPANSION'
  | 'PARTNERSHIP'
  | 'CONTRACT_WIN'
  | 'CONTRACT_LOSS'
  | 'CREDIT_UPGRADE'
  | 'CREDIT_DOWNGRADE'
  | 'RESTRUCTURING'
  | 'GUIDANCE_RAISED'
  | 'GUIDANCE_LOWERED';

export interface MarketEvent {
  id: string;
  type: EventType;
  symbol?: string;
  sector?: Sector;
  impact: number;
  duration: number;
  tick: number;
  headline: string;
  content?: string;
  createdAt: Date;
}

export type MarketRegime =
  | 'bull'
  | 'bear'
  | 'crash'
  | 'bubble'
  | 'normal';

export interface WorldState {
  currentTick: number;
  marketOpen: boolean;
  interestRate: number;
  inflationRate: number;
  gdpGrowth: number;
  regime: MarketRegime;
  lastTickAt: Date;
}

export interface TickUpdate {
  tick: number;
  timestamp: Date;
  marketOpen: boolean;
  regime: MarketRegime;
  priceUpdates: import('./market').PriceUpdate[];
  trades: import('./market').Trade[];
  events: MarketEvent[];
  news: NewsArticle[];
}

export interface NewsArticle {
  id: string;
  tick: number;
  headline: string;
  content?: string;
  category: NewsCategory;
  sentiment: number;
  agentIds: string[];
  symbols: string[];
  createdAt: Date;
  /** Whether this is breaking news for a major market event */
  isBreaking?: boolean;
}

export type NewsCategory =
  | 'earnings'
  | 'merger'
  | 'scandal'
  | 'regulatory'
  | 'market'
  | 'product'
  | 'analysis'
  | 'crime'
  | 'rumor'
  | 'company';

export interface Investigation {
  id: string;
  agentId: string;
  crimeType: CrimeType;
  evidence: InvestigationEvidence[];
  status: InvestigationStatus;
  tickOpened: number;
  tickCharged?: number;
  tickResolved?: number;
  sentenceYears?: number;
  fineAmount?: number;
  createdAt: Date;
}

export type CrimeType =
  | 'insider_trading'
  | 'market_manipulation'
  | 'spoofing'
  | 'wash_trading'
  | 'pump_and_dump'
  | 'coordination'
  | 'accounting_fraud'
  | 'bribery'
  | 'tax_evasion'
  | 'obstruction';

export type InvestigationStatus =
  | 'open'
  | 'charged'
  | 'trial'
  | 'convicted'
  | 'acquitted'
  | 'settled';

export interface InvestigationEvidence {
  type: string;
  description: string;
  tick: number;
  confidence: number;
}

export interface OrderProcessedEvent {
  orderId: string;
  agentId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  price?: number;
  status: string;
  filledQuantity: number;
  avgFillPrice?: number;
  tick: number;
}

/**
 * Investigation alert event for WebSocket/webhook notifications
 */
export type InvestigationAlertStatus = 'opened' | 'activated' | 'charged' | 'trial' | 'convicted' | 'acquitted' | 'settled';

export interface InvestigationAlert {
  investigationId: string;
  agentId: string;
  status: InvestigationAlertStatus;
  crimeType: CrimeType;
  message: string;
  tick: number;
  fineAmount?: number;
  sentenceYears?: number;
}

/**
 * Heartbeat status for tick engine health monitoring
 */
export type EngineStatus = 'running' | 'stopped' | 'error' | 'initializing';

/**
 * Heartbeat data published by the tick engine for monitoring
 */
export interface EngineHeartbeat {
  /** Current tick number */
  tick: number;
  /** Engine status */
  status: EngineStatus;
  /** Timestamp of the heartbeat */
  timestamp: Date;
  /** Whether market is open */
  marketOpen: boolean;
  /** Time of last successful tick completion (ISO string) */
  lastTickAt: string;
  /** Average tick processing time in ms (rolling window) */
  avgTickDurationMs: number;
  /** Number of ticks processed since start */
  ticksProcessed: number;
  /** Time since engine started in ms */
  uptimeMs: number;
}
