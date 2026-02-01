import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitOpenError,
  createWebhookCircuitRegistry,
} from './circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in closed state', () => {
      const circuit = new CircuitBreaker('test');
      expect(circuit.getState()).toBe('closed');
    });

    it('starts with zero stats', () => {
      const circuit = new CircuitBreaker('test');
      const stats = circuit.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalCalls).toBe(0);
      expect(stats.lastFailureTime).toBeNull();
      expect(stats.lastSuccessTime).toBeNull();
    });

    it('allows requests when closed', () => {
      const circuit = new CircuitBreaker('test');
      expect(circuit.isAllowed()).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('records failures', () => {
      const circuit = new CircuitBreaker('test');
      circuit.recordFailure();
      circuit.recordFailure();

      const stats = circuit.getStats();
      expect(stats.failures).toBe(2);
      expect(stats.totalFailures).toBe(2);
      expect(stats.totalCalls).toBe(2);
    });

    it('opens circuit after reaching failure threshold', () => {
      const circuit = new CircuitBreaker('test', { failureThreshold: 3 });

      circuit.recordFailure();
      circuit.recordFailure();
      expect(circuit.getState()).toBe('closed');

      circuit.recordFailure(); // Third failure opens circuit
      expect(circuit.getState()).toBe('open');
    });

    it('blocks requests when circuit is open', () => {
      const circuit = new CircuitBreaker('test', { failureThreshold: 2 });

      circuit.recordFailure();
      circuit.recordFailure();

      expect(circuit.isAllowed()).toBe(false);
    });

    it('sets lastFailureTime when failure occurs', () => {
      const circuit = new CircuitBreaker('test');
      const now = Date.now();

      circuit.recordFailure();

      const stats = circuit.getStats();
      expect(stats.lastFailureTime).toBe(now);
    });
  });

  describe('success handling', () => {
    it('records successes', () => {
      const circuit = new CircuitBreaker('test');
      circuit.recordSuccess();
      circuit.recordSuccess();

      const stats = circuit.getStats();
      expect(stats.successes).toBe(0); // Successes counter is for half-open state
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalCalls).toBe(2);
    });

    it('resets failure count on success in closed state', () => {
      const circuit = new CircuitBreaker('test', { failureThreshold: 3 });

      circuit.recordFailure();
      circuit.recordFailure();
      expect(circuit.getStats().failures).toBe(2);

      circuit.recordSuccess();
      expect(circuit.getStats().failures).toBe(0);
    });

    it('sets lastSuccessTime when success occurs', () => {
      const circuit = new CircuitBreaker('test');
      const now = Date.now();

      circuit.recordSuccess();

      const stats = circuit.getStats();
      expect(stats.lastSuccessTime).toBe(now);
    });
  });

  describe('recovery', () => {
    it('transitions to half-open after recovery time', () => {
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        recoveryTimeMs: 5000,
      });

      // Open the circuit
      circuit.recordFailure();
      circuit.recordFailure();
      expect(circuit.getState()).toBe('open');

      // Wait for recovery time
      vi.advanceTimersByTime(5000);

      expect(circuit.getState()).toBe('half-open');
    });

    it('allows requests in half-open state', () => {
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        recoveryTimeMs: 5000,
      });

      circuit.recordFailure();
      circuit.recordFailure();
      vi.advanceTimersByTime(5000);

      expect(circuit.isAllowed()).toBe(true);
    });

    it('closes circuit after success threshold in half-open', () => {
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        recoveryTimeMs: 5000,
        successThreshold: 2,
      });

      // Open circuit
      circuit.recordFailure();
      circuit.recordFailure();

      // Wait for half-open
      vi.advanceTimersByTime(5000);
      expect(circuit.getState()).toBe('half-open');

      // Record successes
      circuit.recordSuccess();
      expect(circuit.getState()).toBe('half-open');

      circuit.recordSuccess();
      expect(circuit.getState()).toBe('closed');
    });

    it('reopens circuit on failure in half-open state', () => {
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        recoveryTimeMs: 5000,
      });

      // Open circuit
      circuit.recordFailure();
      circuit.recordFailure();

      // Wait for half-open
      vi.advanceTimersByTime(5000);
      expect(circuit.getState()).toBe('half-open');

      // Fail again
      circuit.recordFailure();
      expect(circuit.getState()).toBe('open');
    });
  });

  describe('getMsUntilRetry', () => {
    it('returns 0 when circuit is closed', () => {
      const circuit = new CircuitBreaker('test');
      expect(circuit.getMsUntilRetry()).toBe(0);
    });

    it('returns 0 when circuit is half-open', () => {
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        recoveryTimeMs: 5000,
      });

      circuit.recordFailure();
      circuit.recordFailure();
      vi.advanceTimersByTime(5000);

      expect(circuit.getMsUntilRetry()).toBe(0);
    });

    it('returns remaining time when circuit is open', () => {
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        recoveryTimeMs: 5000,
      });

      circuit.recordFailure();
      circuit.recordFailure();

      vi.advanceTimersByTime(2000);

      expect(circuit.getMsUntilRetry()).toBe(3000);
    });
  });

  describe('execute', () => {
    it('executes function when circuit is closed', async () => {
      const circuit = new CircuitBreaker('test');
      const fn = vi.fn().mockResolvedValue('result');

      const result = await circuit.execute(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws CircuitOpenError when circuit is open', async () => {
      const circuit = new CircuitBreaker('test', { failureThreshold: 2 });

      circuit.recordFailure();
      circuit.recordFailure();

      const fn = vi.fn().mockResolvedValue('result');

      await expect(circuit.execute(fn)).rejects.toThrow(CircuitOpenError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('records success on successful execution', async () => {
      const circuit = new CircuitBreaker('test');
      const fn = vi.fn().mockResolvedValue('result');

      await circuit.execute(fn);

      expect(circuit.getStats().totalSuccesses).toBe(1);
    });

    it('records failure on failed execution', async () => {
      const circuit = new CircuitBreaker('test');
      const fn = vi.fn().mockRejectedValue(new Error('test error'));

      await expect(circuit.execute(fn)).rejects.toThrow('test error');

      expect(circuit.getStats().totalFailures).toBe(1);
    });
  });

  describe('executeWithTimeout', () => {
    it('times out slow operations', async () => {
      vi.useRealTimers(); // Need real timers for Promise.race

      const circuit = new CircuitBreaker('test', { timeoutMs: 100 });
      const fn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 500))
      );

      await expect(circuit.executeWithTimeout(fn)).rejects.toThrow('Timeout');

      expect(circuit.getStats().totalFailures).toBe(1);
    });
  });

  describe('manual controls', () => {
    it('reset closes circuit and clears counters', () => {
      const circuit = new CircuitBreaker('test', { failureThreshold: 2 });

      circuit.recordFailure();
      circuit.recordFailure();
      expect(circuit.getState()).toBe('open');

      circuit.reset();

      expect(circuit.getState()).toBe('closed');
      expect(circuit.getStats().failures).toBe(0);
    });

    it('trip opens circuit immediately', () => {
      const circuit = new CircuitBreaker('test');

      circuit.trip();

      expect(circuit.getState()).toBe('open');
    });
  });

  describe('state change callback', () => {
    it('calls onStateChange when state changes', () => {
      const onStateChange = vi.fn();
      const circuit = new CircuitBreaker('test', {
        failureThreshold: 2,
        onStateChange,
      });

      circuit.recordFailure();
      circuit.recordFailure();

      expect(onStateChange).toHaveBeenCalledWith('open', 'closed');
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  it('creates new circuits on first access', () => {
    const registry = new CircuitBreakerRegistry();
    const circuit = registry.get('test');

    expect(circuit).toBeInstanceOf(CircuitBreaker);
    expect(circuit.getState()).toBe('closed');
  });

  it('returns same circuit on subsequent access', () => {
    const registry = new CircuitBreakerRegistry();
    const circuit1 = registry.get('test');
    const circuit2 = registry.get('test');

    expect(circuit1).toBe(circuit2);
  });

  it('applies default config to new circuits', () => {
    const registry = new CircuitBreakerRegistry({
      failureThreshold: 10,
    });

    const circuit = registry.get('test');

    // Verify it uses the config by checking threshold
    for (let i = 0; i < 9; i++) {
      circuit.recordFailure();
    }
    expect(circuit.getState()).toBe('closed');

    circuit.recordFailure();
    expect(circuit.getState()).toBe('open');
  });

  it('has returns true for existing circuits', () => {
    const registry = new CircuitBreakerRegistry();
    registry.get('test');

    expect(registry.has('test')).toBe(true);
    expect(registry.has('other')).toBe(false);
  });

  it('remove deletes a circuit', () => {
    const registry = new CircuitBreakerRegistry();
    registry.get('test');

    expect(registry.remove('test')).toBe(true);
    expect(registry.has('test')).toBe(false);
  });

  it('getAll returns all circuits', () => {
    const registry = new CircuitBreakerRegistry();
    registry.get('circuit1');
    registry.get('circuit2');

    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.has('circuit1')).toBe(true);
    expect(all.has('circuit2')).toBe(true);
  });

  it('getAllStats returns stats for all circuits', () => {
    const registry = new CircuitBreakerRegistry();
    const circuit1 = registry.get('circuit1');
    circuit1.recordSuccess();

    const stats = registry.getAllStats();
    expect(stats.size).toBe(1);
    expect(stats.get('circuit1')?.totalSuccesses).toBe(1);
  });

  it('getOpenCircuits returns only open circuits', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2 });

    const circuit1 = registry.get('circuit1');
    const circuit2 = registry.get('circuit2');

    circuit1.recordFailure();
    circuit1.recordFailure(); // Opens circuit1

    circuit2.recordSuccess(); // circuit2 stays closed

    const openCircuits = registry.getOpenCircuits();
    expect(openCircuits).toEqual(['circuit1']);
  });

  it('resetAll resets all circuits', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2 });

    const circuit1 = registry.get('circuit1');
    circuit1.recordFailure();
    circuit1.recordFailure();

    expect(circuit1.getState()).toBe('open');

    registry.resetAll();

    expect(circuit1.getState()).toBe('closed');
  });

  it('clear removes all circuits', () => {
    const registry = new CircuitBreakerRegistry();
    registry.get('circuit1');
    registry.get('circuit2');

    registry.clear();

    expect(registry.getAll().size).toBe(0);
  });
});

describe('createWebhookCircuitRegistry', () => {
  it('creates registry with webhook-specific defaults', () => {
    const registry = createWebhookCircuitRegistry();
    const circuit = registry.get('test');

    // Default config: failureThreshold: 5
    for (let i = 0; i < 4; i++) {
      circuit.recordFailure();
    }
    expect(circuit.getState()).toBe('closed');

    circuit.recordFailure();
    expect(circuit.getState()).toBe('open');
  });
});

describe('CircuitOpenError', () => {
  it('contains circuit ID and retry time', () => {
    const error = new CircuitOpenError('test-circuit', 5000);

    expect(error.circuitId).toBe('test-circuit');
    expect(error.msUntilRetry).toBe(5000);
    expect(error.message).toContain('test-circuit');
    expect(error.message).toContain('5000');
  });
});
