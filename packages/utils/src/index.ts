// Constants
export {
  TICK_INTERVAL_MS,
  TICKS_PER_TRADING_DAY,
  TICKS_AFTER_HOURS,
  MARKET_OPEN_TICK,
  MARKET_CLOSE_TICK,
  TICKS_PER_SENTENCE_YEAR,
  MAX_ORDER_QUANTITY,
  MIN_ORDER_QUANTITY,
  MAX_PRICE,
  MIN_PRICE,
  MAX_LEVERAGE,
  DEFAULT_MARGIN_REQUIREMENT,
  AGENT_PRESSURE_WEIGHT,
  RANDOM_WALK_WEIGHT,
  SECTOR_CORRELATION_WEIGHT,
  SENTIMENT_WEIGHT,
  MAX_TICK_MOVE,
  SENTIMENT_LOOKBACK_TICKS,
  SENTIMENT_DECAY_FACTOR,
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
  LogLevelSchema,
  validateEnv,
  safeValidateEnv,
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

// LLM Rate Limiter utilities
export {
  LLMRateLimiter,
  getLLMRateLimiter,
  resetLLMRateLimiter,
  withRateLimit,
  RateLimitExceededError,
  DEFAULT_LLM_RATE_LIMIT_CONFIG,
  LLM_RATE_LIMIT_PROFILES,
} from './llm-rate-limiter';

export type {
  LLMRateLimiterConfig,
  RateLimitAcquireResult,
  RateLimiterStats,
} from './llm-rate-limiter';

// Sentiment analysis utilities
export {
  analyzeSentiment,
  getSentimentScore,
  getSentimentScoreString,
  calculateRumorImpact,
} from './sentiment';

export type { SentimentResult, RumorImpactConfig, RumorImpactResult } from './sentiment';

// Logger utilities
export {
  createLogger,
  createChildLogger,
  createRotatingLogger,
  getLogger,
  loggers,
  getLogLevel,
  isValidLogLevel,
  LOG_LEVELS,
  DEFAULT_LOG_LEVELS,
  // Log rotation utilities
  DEFAULT_LOG_DIR,
  DEFAULT_MAX_DAYS,
  ensureLogDirectory,
  getLogFilename,
  getLogFilePath,
  cleanOldLogFiles,
  getLogFiles,
  createLogRotationManager,
} from './logger';

export type {
  Logger,
  Level,
  LoggerConfig,
  LogLevel,
  Environment,
  RotatingLogger,
  LogRotationConfig,
  LogRotationManager,
} from './logger';

// Request context utilities
export {
  runWithRequestContext,
  getRequestContext,
  getRequestId,
  getAgentId,
  setAgentId,
  getRequestLogger,
  getRequestDuration,
  createRequestChildLogger,
} from './request-context';

export type { RequestContext } from './request-context';

// Secrets management
export {
  getSecretsManager,
  initializeSecrets,
  getSecret,
  getOptionalSecret,
  hasSecret,
  resetSecretsManager,
  redactSecrets,
  redactValue,
  containsSecret,
  redactObject,
  isAINewsEnabled,
  isClickHouseEnabled,
  isFinnhubEnabled,
  isAlpacaEnabled,
  getFeatureAvailability,
  SECRET_KEYS,
  RequiredSecretsSchema,
  OptionalSecretsSchema,
  SecretsSchema,
} from './secrets';

export type {
  RequiredSecrets,
  OptionalSecrets,
  Secrets,
  SecretKey,
} from './secrets';
