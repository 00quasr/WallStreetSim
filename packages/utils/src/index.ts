// Constants
export {
  TICK_INTERVAL_MS,
  TICKS_PER_TRADING_DAY,
  TICKS_AFTER_HOURS,
  MARKET_OPEN_TICK,
  MARKET_CLOSE_TICK,
  MAX_ORDER_QUANTITY,
  MIN_ORDER_QUANTITY,
  MAX_PRICE,
  MIN_PRICE,
  MAX_LEVERAGE,
  DEFAULT_MARGIN_REQUIREMENT,
  AGENT_PRESSURE_WEIGHT,
  RANDOM_WALK_WEIGHT,
  SECTOR_CORRELATION_WEIGHT,
  MAX_TICK_MOVE,
  BASE_EVENT_CHANCE,
  BLACK_SWAN_CHANCE,
  ROLE_CONFIGS,
  SECTOR_CONFIGS,
  COMPANY_PREFIXES,
  SECTOR_SUFFIXES,
  SECTOR_INDUSTRIES,
  SECTOR_DISTRIBUTION,
} from './constants';

// Validation schemas
export {
  AgentRoleSchema,
  AgentStatusSchema,
  RegisterAgentSchema,
  OrderSideSchema,
  OrderTypeSchema,
  CreateOrderSchema,
  AgentActionTypeSchema,
  TradeActionSchema,
  CancelOrderActionSchema,
  RumorActionSchema,
  AllyActionSchema,
  MessageActionSchema,
  BribeActionSchema,
  WhistleblowActionSchema,
  FleeActionSchema,
  AgentActionSchema,
  SubmitActionsSchema,
  SectorSchema,
  PaginationSchema,
  SymbolParamSchema,
  AgentIdParamSchema,
  EnvSchema,
} from './validation';

export type {
  RegisterAgentInput,
  CreateOrderInput,
  AgentActionInput,
  SubmitActionsInput,
  PaginationInput,
  EnvConfig,
} from './validation';

// Formatting utilities
export {
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatNumberCompact,
  formatPercent,
  formatPriceChange,
  formatTimestamp,
  formatDate,
  formatTick,
  formatDuration,
  round,
  clamp,
  asciiProgressBar,
  asciiSparkline,
} from './formatting';

// Crypto utilities
export {
  generateApiKey,
  generateSignedApiKey,
  verifyApiKey,
  hashApiKey,
  generateUUID,
  generateShortId,
  generateHash,
  createSessionToken,
  verifySessionToken,
  generateWebhookSecret,
  signWebhookPayload,
  verifyWebhookSignature,
} from './crypto';

export type { SessionTokenPayload } from './crypto';

// Math utilities
export {
  randomNormal,
  gbmReturn,
  gbmNextPrice,
  standardDeviation,
  calculateReturns,
  historicalVolatility,
  ema,
  sma,
  rsi,
  orderBookImbalance,
  tradeImbalance,
  priceImpact,
  weightedRandom,
  lerp,
  cagr,
  sharpeRatio,
  maxDrawdown,
} from './math';

// Retry utilities
export {
  retryWithBackoff,
  retry,
  withRetry,
  withRetryResult,
  calculateBackoffDelay,
  sleep,
  isRetryableError,
  isRetryableStatusCode,
  DEFAULT_RETRY_CONFIG,
  RETRY_PROFILES,
} from './retry';

export type { RetryConfig, RetryResult } from './retry';

// Circuit Breaker utilities
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  createWebhookCircuitRegistry,
} from './circuit-breaker';

export type {
  CircuitState,
  CircuitBreakerConfig,
  CircuitStats,
} from './circuit-breaker';

// Sentiment analysis utilities
export {
  analyzeSentiment,
  getSentimentScore,
  getSentimentScoreString,
  calculateRumorImpact,
} from './sentiment';

export type { SentimentResult, RumorImpactConfig, RumorImpactResult } from './sentiment';
