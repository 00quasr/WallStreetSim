import type { Agent, AgentPortfolio, AgentRole, AgentAlert, AgentMessage } from './agent';
import type { Company, CompanyState } from './company';
import type { Order, CreateOrderRequest, OrderResult } from './order';
import type { OrderBook, Trade, StockQuote, MarketSnapshot } from './market';
import type { WorldState, TickUpdate, NewsArticle, MarketEvent } from './events';

// API Request Types
export interface RegisterAgentRequest {
  name: string;
  role: AgentRole;
  callbackUrl?: string;
}

export interface RegisterAgentResponse {
  agentId: string;
  apiKey: string;
  role: AgentRole;
  startingCapital: number;
}

export interface VerifyApiKeyRequest {
  apiKey: string;
}

export interface VerifyApiKeyResponse {
  valid: boolean;
  agentId?: string;
}

// Action Types
export type AgentActionType =
  | 'BUY'
  | 'SELL'
  | 'SHORT'
  | 'COVER'
  | 'CANCEL_ORDER'
  | 'RUMOR'
  | 'ALLY'
  | 'MESSAGE'
  | 'BRIBE'
  | 'WHISTLEBLOW'
  | 'FLEE';

export interface AgentAction {
  type: AgentActionType;
  payload: Record<string, unknown>;
}

export interface SubmitActionsRequest {
  actions: AgentAction[];
}

export interface SubmitActionsResponse {
  results: ActionResult[];
}

export interface ActionResult {
  action: AgentActionType;
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// WebSocket Message Types
export type WSMessageType =
  | 'TICK_UPDATE'
  | 'MARKET_UPDATE'
  | 'TRADE'
  | 'NEWS'
  | 'AGENT_UPDATE'
  | 'ALERT'
  | 'ORDER_FILLED'
  | 'ORDER_UPDATE'
  | 'INVESTIGATION'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'ACTION'
  | 'PING'
  | 'PONG'
  | 'PRICE_UPDATE'
  | 'LEADERBOARD_UPDATE'
  | 'PORTFOLIO_UPDATE'
  | 'PRIVATE_MESSAGE'
  | 'MARGIN_CALL';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: string;
}

export interface WSTickUpdate extends WSMessage {
  type: 'TICK_UPDATE';
  payload: TickUpdate;
}

export interface WSMarketUpdate extends WSMessage {
  type: 'MARKET_UPDATE';
  payload: {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
  };
}

export interface WSTrade extends WSMessage {
  type: 'TRADE';
  payload: Trade;
}

export interface WSNews extends WSMessage {
  type: 'NEWS';
  payload: NewsArticle;
}

export interface WSAlert extends WSMessage {
  type: 'ALERT';
  payload: AgentAlert;
}

export interface WSSubscribe extends WSMessage {
  type: 'SUBSCRIBE';
  payload: {
    channels: string[];
  };
}

export interface WSUnsubscribe extends WSMessage {
  type: 'UNSUBSCRIBE';
  payload: {
    channels: string[];
  };
}

export interface WSPriceUpdate extends WSMessage {
  type: 'PRICE_UPDATE';
  payload: {
    tick: number;
    prices: {
      symbol: string;
      price: number;
      change: number;
      changePercent: number;
      volume: number;
    }[];
  };
}

export interface WSLeaderboardUpdate extends WSMessage {
  type: 'LEADERBOARD_UPDATE';
  payload: Leaderboard;
}

// Private channel message types (agent-specific)
export interface WSOrderUpdate extends WSMessage {
  type: 'ORDER_UPDATE';
  payload: {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP';
    quantity: number;
    price?: number;
    status: string;
    filledQuantity: number;
    avgFillPrice?: number;
    tick: number;
  };
}

export interface WSOrderFilled extends WSMessage {
  type: 'ORDER_FILLED';
  payload: {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    tick: number;
  };
}

export interface WSPortfolioUpdate extends WSMessage {
  type: 'PORTFOLIO_UPDATE';
  payload: AgentPortfolio;
}

export interface WSPrivateMessage extends WSMessage {
  type: 'PRIVATE_MESSAGE';
  payload: AgentMessage;
}

export interface WSInvestigation extends WSMessage {
  type: 'INVESTIGATION';
  payload: {
    investigationId: string;
    status: 'opened' | 'charged' | 'resolved';
    crimeType: string;
    message: string;
    tick: number;
  };
}

export interface WSMarginCall extends WSMessage {
  type: 'MARGIN_CALL';
  payload: {
    marginUsed: number;
    marginLimit: number;
    portfolioValue: number;
    message: string;
    tick: number;
  };
}

// Webhook Types (for agent callbacks)
export interface TickWebhook {
  tick: number;
  timestamp: string;
  portfolio: AgentPortfolio;
  orders: Order[];
  market: {
    indices: { name: string; value: number; change: number }[];
    watchlist: StockQuote[];
    recentTrades: Trade[];
  };
  world: WorldState;
  news: NewsArticle[];
  messages: AgentMessage[];
  alerts: AgentAlert[];
}

export interface WebhookResponse {
  actions: AgentAction[];
}

// Leaderboard Types
export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  role: AgentRole;
  netWorth: number;
  change24h: number;
  status: Agent['status'];
}

export interface Leaderboard {
  timestamp: Date;
  entries: LeaderboardEntry[];
}
