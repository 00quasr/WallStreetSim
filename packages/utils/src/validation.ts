import { z } from 'zod';

// Agent validation schemas
export const AgentRoleSchema = z.enum([
  'hedge_fund_manager',
  'retail_trader',
  'ceo',
  'investment_banker',
  'financial_journalist',
  'sec_investigator',
  'whistleblower',
  'quant',
  'influencer',
]);

export const AgentStatusSchema = z.enum([
  'active',
  'bankrupt',
  'imprisoned',
  'fled',
]);

export const RegisterAgentSchema = z.object({
  name: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Name can only contain letters, numbers, underscores, and hyphens'),
  role: AgentRoleSchema,
  callbackUrl: z.string().url().optional(),
});

// Order validation schemas
export const OrderSideSchema = z.enum(['BUY', 'SELL']);

export const OrderTypeSchema = z.enum(['MARKET', 'LIMIT', 'STOP']);

export const CreateOrderSchema = z.object({
  symbol: z.string().min(1).max(10).regex(/^[A-Z]+$/, 'Symbol must be uppercase letters only'),
  side: OrderSideSchema,
  type: OrderTypeSchema,
  quantity: z.number().int().positive().max(1_000_000),
  price: z.number().positive().max(1_000_000).optional(),
  stopPrice: z.number().positive().max(1_000_000).optional(),
}).refine(
  (data) => data.type === 'MARKET' || data.price !== undefined,
  { message: 'Price is required for LIMIT and STOP orders' }
);

// Action validation schemas
export const AgentActionTypeSchema = z.enum([
  'BUY',
  'SELL',
  'SHORT',
  'COVER',
  'CANCEL_ORDER',
  'RUMOR',
  'ALLY',
  'MESSAGE',
  'BRIBE',
  'WHISTLEBLOW',
  'FLEE',
]);

export const TradeActionSchema = z.object({
  type: z.enum(['BUY', 'SELL', 'SHORT', 'COVER']),
  symbol: z.string().min(1).max(10).regex(/^[A-Z]+$/),
  quantity: z.number().int().positive().max(1_000_000),
  orderType: OrderTypeSchema.optional().default('MARKET'),
  price: z.number().positive().optional(),
});

export const CancelOrderActionSchema = z.object({
  type: z.literal('CANCEL_ORDER'),
  orderId: z.string().uuid(),
});

export const RumorActionSchema = z.object({
  type: z.literal('RUMOR'),
  targetSymbol: z.string().min(1).max(10).regex(/^[A-Z]+$/),
  content: z.string().min(10).max(280),
});

export const AllyActionSchema = z.object({
  type: z.literal('ALLY'),
  targetAgent: z.string().uuid(),
  proposal: z.string().min(10).max(500),
});

export const MessageActionSchema = z.object({
  type: z.literal('MESSAGE'),
  targetAgent: z.string().uuid(),
  content: z.string().min(1).max(500),
});

export const BribeActionSchema = z.object({
  type: z.literal('BRIBE'),
  targetAgent: z.string().uuid(),
  amount: z.number().positive(),
});

export const WhistleblowActionSchema = z.object({
  type: z.literal('WHISTLEBLOW'),
  targetAgent: z.string().uuid(),
  evidence: z.string().min(20).max(1000),
});

export const FleeActionSchema = z.object({
  type: z.literal('FLEE'),
  destination: z.string().min(2).max(50),
});

export const AgentActionSchema = z.discriminatedUnion('type', [
  TradeActionSchema,
  CancelOrderActionSchema,
  RumorActionSchema,
  AllyActionSchema,
  MessageActionSchema,
  BribeActionSchema,
  WhistleblowActionSchema,
  FleeActionSchema,
]);

export const SubmitActionsSchema = z.object({
  actions: z.array(AgentActionSchema).min(1).max(10),
});

// Company validation schemas
export const SectorSchema = z.enum([
  'Technology',
  'Finance',
  'Healthcare',
  'Energy',
  'Consumer',
  'Industrial',
  'RealEstate',
  'Utilities',
  'Crypto',
  'Meme',
]);

// API request validation schemas
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const SymbolParamSchema = z.object({
  symbol: z.string().min(1).max(10).regex(/^[A-Z]+$/),
});

export const AgentIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Environment validation
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  CLICKHOUSE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  API_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(8080),
  FINNHUB_API_KEY: z.string().optional(),
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

// Type exports
export type RegisterAgentInput = z.infer<typeof RegisterAgentSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type AgentActionInput = z.infer<typeof AgentActionSchema>;
export type SubmitActionsInput = z.infer<typeof SubmitActionsSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type EnvConfig = z.infer<typeof EnvSchema>;
