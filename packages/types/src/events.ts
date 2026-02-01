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
  | 'RALLY';

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
}

export type NewsCategory =
  | 'earnings'
  | 'merger'
  | 'scandal'
  | 'regulatory'
  | 'market'
  | 'product'
  | 'analysis'
  | 'crime';

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
  | 'wash_trading'
  | 'pump_and_dump'
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
