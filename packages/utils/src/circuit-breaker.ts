/**
 * Circuit Breaker pattern implementation for graceful handling of slow/unresponsive endpoints
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery (default: 30000) */
  recoveryTimeMs: number;
  /** Number of successful calls in half-open state to close the circuit (default: 2) */
  successThreshold: number;
  /** Timeout in ms for individual calls (default: 5000) */
  timeoutMs: number;
  /** Callback when circuit state changes */
  onStateChange?: (state: CircuitState, previousState: CircuitState) => void;
}

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 30000, // 30 seconds
  successThreshold: 2,
  timeoutMs: 5000,
};

/**
 * Circuit Breaker error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitId: string,
    public readonly msUntilRetry: number
  ) {
    super(`Circuit '${circuitId}' is open. Retry in ${msUntilRetry}ms`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private config: CircuitBreakerConfig;

  constructor(
    private readonly id: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current circuit statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Check if circuit allows requests
   */
  isAllowed(): boolean {
    this.updateState();
    return this.state !== 'open';
  }

  /**
   * Get time until circuit can be retried (0 if allowed)
   */
  getMsUntilRetry(): number {
    if (this.state !== 'open' || !this.lastFailureTime) {
      return 0;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.recoveryTimeMs - elapsed);
  }

  /**
   * Update circuit state based on recovery time
   */
  private updateState(): void {
    if (this.state === 'open' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.recoveryTimeMs) {
        this.transitionTo('half-open');
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const previousState = this.state;
      this.state = newState;
      if (newState === 'half-open') {
        this.successes = 0;
      }
      this.config.onStateChange?.(newState, previousState);
    }
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    this.totalCalls++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.failures = 0;
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed call
   */
  recordFailure(): void {
    this.totalCalls++;
    this.totalFailures++;
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open immediately opens the circuit
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.updateState();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.id, this.getMsUntilRetry());
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Execute a function with circuit breaker protection and timeout
   */
  async executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    this.updateState();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.id, this.getMsUntilRetry());
    }

    const timeout = timeoutMs ?? this.config.timeoutMs;

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), timeout);
        }),
      ]);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit to closed state
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.transitionTo('closed');
  }

  /**
   * Manually trip the circuit to open state
   */
  trip(): void {
    this.lastFailureTime = Date.now();
    this.transitionTo('open');
  }
}

/**
 * Registry for managing multiple circuit breakers by ID
 */
export class CircuitBreakerRegistry {
  private circuits = new Map<string, CircuitBreaker>();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a circuit breaker for the given ID
   */
  get(id: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let circuit = this.circuits.get(id);
    if (!circuit) {
      circuit = new CircuitBreaker(id, { ...this.defaultConfig, ...config });
      this.circuits.set(id, circuit);
    }
    return circuit;
  }

  /**
   * Check if a circuit exists
   */
  has(id: string): boolean {
    return this.circuits.has(id);
  }

  /**
   * Remove a circuit breaker
   */
  remove(id: string): boolean {
    return this.circuits.delete(id);
  }

  /**
   * Get all circuit breakers
   */
  getAll(): Map<string, CircuitBreaker> {
    return new Map(this.circuits);
  }

  /**
   * Get stats for all circuits
   */
  getAllStats(): Map<string, CircuitStats> {
    const stats = new Map<string, CircuitStats>();
    for (const [id, circuit] of this.circuits) {
      stats.set(id, circuit.getStats());
    }
    return stats;
  }

  /**
   * Get IDs of circuits that are currently open
   */
  getOpenCircuits(): string[] {
    return Array.from(this.circuits.entries())
      .filter(([, circuit]) => circuit.getState() === 'open')
      .map(([id]) => id);
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    for (const circuit of this.circuits.values()) {
      circuit.reset();
    }
  }

  /**
   * Clear all circuits from the registry
   */
  clear(): void {
    this.circuits.clear();
  }
}

/**
 * Create a circuit breaker registry with default webhook configuration
 */
export function createWebhookCircuitRegistry(): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry({
    failureThreshold: 5, // Open after 5 consecutive failures
    recoveryTimeMs: 60000, // Wait 1 minute before retrying
    successThreshold: 2, // Need 2 successes in half-open to close
    timeoutMs: 5000, // 5 second timeout per call
  });
}
