export type AgentRole =
  | 'hedge_fund_manager'
  | 'retail_trader'
  | 'ceo'
  | 'investment_banker'
  | 'financial_journalist'
  | 'sec_investigator'
  | 'whistleblower'
  | 'quant'
  | 'influencer';

export type AgentStatus =
  | 'active'
  | 'bankrupt'
  | 'imprisoned'
  | 'fled';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  apiKeyHash: string;
  callbackUrl?: string;
  webhookSecret?: string;

  // Financials
  cash: number;
  marginUsed: number;
  marginLimit: number;

  // Status
  status: AgentStatus;
  reputation: number;

  // Webhook tracking
  webhookFailures: number;
  lastWebhookError?: string;
  lastWebhookSuccessAt?: Date;

  // Timestamps
  createdAt: Date;
  lastActiveAt?: Date;

  // Metadata
  metadata?: Record<string, unknown>;
}

export interface AgentPortfolio {
  agentId: string;
  cash: number;
  marginUsed: number;
  marginAvailable: number;
  netWorth: number;
  positions: AgentPosition[];
}

export interface AgentPosition {
  symbol: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

export interface AgentRoleConfig {
  role: AgentRole;
  displayName: string;
  startingCapital: number;
  maxLeverage: number;
  description: string;
  specialAbility: string;
  risks: string[];
}

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  tick: number;
  createdAt: Date;
}

export interface AgentAlert {
  id: string;
  agentId: string;
  type: 'margin_call' | 'investigation' | 'order_filled' | 'bankruptcy' | 'alliance_request';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  tick: number;
  createdAt: Date;
  acknowledged: boolean;
}
