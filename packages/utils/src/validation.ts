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

export const AllianceStatusSchema = z.enum([
  'pending',
  'active',
  'dissolved',
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
  'ALLY_ACCEPT',
  'ALLY_REJECT',
  'ALLY_DISSOLVE',
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
  profitSharePercent: z.number().min(0).max(100).default(0),
});

export const AllyAcceptActionSchema = z.object({
  type: z.literal('ALLY_ACCEPT'),
  allianceId: z.string().uuid(),
});

export const AllyRejectActionSchema = z.object({
  type: z.literal('ALLY_REJECT'),
  allianceId: z.string().uuid(),
  reason: z.string().min(1).max(200).optional(),
});

export const AllyDissolveActionSchema = z.object({
  type: z.literal('ALLY_DISSOLVE'),
  reason: z.string().min(1).max(200).optional(),
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
  AllyAcceptActionSchema,
  AllyRejectActionSchema,
  AllyDissolveActionSchema,
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

// Log level validation
export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);

// Boolean string validation (handles 'true', 'false', '1', '0')
const BooleanStringSchema = z.enum(['true', 'false', '1', '0']).transform((val) => val === 'true' || val === '1');

// Environment validation
export const EnvSchema = z.object({
  // Core environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database connections
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().min(1),
  CLICKHOUSE_URL: z.string().url().optional(),

  // Authentication & security
  JWT_SECRET: z.string().min(32),
  API_SECRET: z.string().min(32),

  // Server ports
  PORT: z.coerce.number().int().positive().default(3000),
  API_PORT: z.coerce.number().int().positive().default(8080),

  // Engine configuration
  TICK_INTERVAL_MS: z.coerce.number().int().positive().default(1000),

  // Logging configuration
  LOG_LEVEL: LogLevelSchema.optional(),
  LOG_LEVEL_API: LogLevelSchema.optional(),
  LOG_LEVEL_ENGINE: LogLevelSchema.optional(),
  LOG_FILE_ENABLED: BooleanStringSchema.optional(),

  // URL configuration
  API_BASE_URL: z.string().url().optional(),
  WS_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),

  // Socket.io configuration
  SOCKET_REDIS_ADAPTER: BooleanStringSchema.optional().default('false'),
  SOCKET_AUTO_RECOVERY: BooleanStringSchema.optional().default('true'),

  // External API keys (all optional)
  FINNHUB_API_KEY: z.string().optional(),
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

/**
 * Validate environment variables at application startup.
 * Throws a ZodError if validation fails, with detailed messages.
 *
 * @example
 * ```typescript
 * import { validateEnv } from '@wallstreetsim/utils';
 *
 * // At app startup
 * const env = validateEnv();
 * console.log(env.DATABASE_URL);
 * ```
 */
export function validateEnv(): EnvConfig {
  return EnvSchema.parse(process.env);
}

/**
 * Safely validate environment variables without throwing.
 * Returns the validated config or null if validation fails.
 *
 * @example
 * ```typescript
 * import { safeValidateEnv } from '@wallstreetsim/utils';
 *
 * const result = safeValidateEnv();
 * if (result.success) {
 *   console.log(result.data.DATABASE_URL);
 * } else {
 *   console.error('Invalid env:', result.error.issues);
 * }
 * ```
 */
export function safeValidateEnv(): z.SafeParseReturnType<unknown, EnvConfig> {
  return EnvSchema.safeParse(process.env);
}

// Type exports
export type RegisterAgentInput = z.infer<typeof RegisterAgentSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type AgentActionInput = z.infer<typeof AgentActionSchema>;
export type SubmitActionsInput = z.infer<typeof SubmitActionsSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type EnvConfig = z.infer<typeof EnvSchema>;
