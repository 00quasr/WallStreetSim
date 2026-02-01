import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';

// Mock the database module
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  agents: {
    webhookFailures: 'webhook_failures',
  },
  holdings: {},
  orders: {},
  companies: {},
}));

// Mock the db service module
vi.mock('../services/db', () => ({
  recordWebhookSuccess: vi.fn(),
  recordWebhookFailure: vi.fn(),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  dispatchWebhooks,
  getCircuitRegistry,
} from '../services/webhook';
import * as dbService from '../services/db';
import type { PriceUpdate, WorldState } from '@wallstreetsim/types';
import { db } from '@wallstreetsim/db';

describe('Webhook Circuit Breaker Integration', () => {
  const mockWorldState: WorldState = {
    currentTick: 100,
    marketOpen: true,
    interestRate: 0.05,
    inflationRate: 0.02,
    gdpGrowth: 0.03,
    regime: 'normal',
    lastTickAt: new Date(),
  };

  const mockPriceUpdates: PriceUpdate[] = [
    {
      symbol: 'AAPL',
      oldPrice: 149.00,
      newPrice: 150.50,
      change: 1.50,
      changePercent: 1.007,
      volume: 10000,
      tick: 100,
      drivers: {
        agentPressure: 0,
        randomWalk: 0.01,
        sectorCorrelation: 0,
        eventImpact: 0,
      },
    },
  ];

  const mockAgent = {
    id: 'agent-circuit-test',
    name: 'Circuit Test Agent',
    callbackUrl: 'https://agent.example.com/webhook',
    webhookSecret: 'secret',
    cash: '10000.00',
    marginUsed: '0.00',
    marginLimit: '50000.00',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset circuit breaker registry
    getCircuitRegistry().clear();

    // Default: agent with callback
    let callCount = 0;
    (db.select as Mock).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve([mockAgent]);
          }
          return Promise.resolve([]);
        }),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('circuit breaker opens after consecutive failures', () => {
    it('opens circuit after 5 consecutive failures', async () => {
      // Always return 500 error (non-retryable would be better but 500 is retryable)
      // Use 400 which is not retryable
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({}),
      });

      // Make 5 failing requests (each tick)
      for (let i = 0; i < 5; i++) {
        let callCount = 0;
        (db.select as Mock).mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve([mockAgent]);
              }
              return Promise.resolve([]);
            }),
          }),
        });

        await dispatchWebhooks(100 + i, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });
      }

      // 6th request should be skipped by circuit breaker
      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      const results = await dispatchWebhooks(105, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });

      expect(results).toHaveLength(1);
      expect(results[0].circuitBreakerSkipped).toBe(true);
      expect(results[0].error).toContain('Circuit breaker open');
    });
  });

  describe('circuit breaker skips webhook calls', () => {
    it('does not call fetch when circuit is open', async () => {
      // Open the circuit manually by recording failures
      const circuit = getCircuitRegistry().get(mockAgent.id);
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure();
      }

      expect(circuit.getState()).toBe('open');

      mockFetch.mockClear();

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });

      // Fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not record metrics when circuit breaker skips', async () => {
      const circuit = getCircuitRegistry().get(mockAgent.id);
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure();
      }

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });

      expect(dbService.recordWebhookSuccess).not.toHaveBeenCalled();
      expect(dbService.recordWebhookFailure).not.toHaveBeenCalled();
    });
  });

  describe('circuit breaker recovery', () => {
    it('records success after successful webhook', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });

      const circuit = getCircuitRegistry().get(mockAgent.id);
      expect(circuit.getStats().totalSuccesses).toBe(1);
    });

    it('resets failure count after success', async () => {
      // First, record some failures (but not enough to open)
      const circuit = getCircuitRegistry().get(mockAgent.id);
      circuit.recordFailure();
      circuit.recordFailure();
      circuit.recordFailure();
      expect(circuit.getStats().failures).toBe(3);

      // Now make a successful request
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });

      // Failure count should be reset
      expect(circuit.getStats().failures).toBe(0);
    });
  });

  describe('multiple agents with circuit breakers', () => {
    it('tracks circuit state per agent', async () => {
      const agent1 = { ...mockAgent, id: 'agent-1', callbackUrl: 'https://agent1.example.com/webhook' };
      const agent2 = { ...mockAgent, id: 'agent-2', callbackUrl: 'https://agent2.example.com/webhook' };

      // Open circuit for agent1 only
      const circuit1 = getCircuitRegistry().get(agent1.id);
      for (let i = 0; i < 5; i++) {
        circuit1.recordFailure();
      }

      let callCount = 0;
      (db.select as Mock).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([agent1, agent2]);
            }
            return Promise.resolve([]);
          }),
        }),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      const results = await dispatchWebhooks(100, mockWorldState, mockPriceUpdates, [], [], [], { maxRetries: 0 });

      // Agent 1 should be skipped, agent 2 should succeed
      expect(results).toHaveLength(2);

      const result1 = results.find(r => r.agentId === 'agent-1');
      const result2 = results.find(r => r.agentId === 'agent-2');

      expect(result1?.circuitBreakerSkipped).toBe(true);
      expect(result2?.success).toBe(true);
      expect(result2?.circuitBreakerSkipped).toBeUndefined();
    });
  });

  describe('getCircuitRegistry', () => {
    it('returns the circuit registry for monitoring', () => {
      const registry = getCircuitRegistry();
      expect(registry).toBeDefined();

      // Create a circuit
      const circuit = registry.get('test-agent');
      expect(circuit).toBeDefined();

      // Verify we can get stats
      const allStats = registry.getAllStats();
      expect(allStats.has('test-agent')).toBe(true);
    });

    it('allows getting open circuits for monitoring', () => {
      const registry = getCircuitRegistry();

      // Open a circuit
      const circuit = registry.get('failing-agent');
      for (let i = 0; i < 5; i++) {
        circuit.recordFailure();
      }

      const openCircuits = registry.getOpenCircuits();
      expect(openCircuits).toContain('failing-agent');
    });
  });
});
