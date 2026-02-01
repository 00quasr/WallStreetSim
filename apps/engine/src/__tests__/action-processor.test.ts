import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock the database module
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
  agents: { id: 'id', cash: 'cash', status: 'status' },
  orders: { id: 'id', agentId: 'agent_id', status: 'status' },
  actions: {},
}));

import { processWebhookActions } from '../services/action-processor';
import type { WebhookResult } from '../services/webhook';
import { db } from '@wallstreetsim/db';

describe('Action Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processWebhookActions', () => {
    it('returns empty array when no webhook results have actions', async () => {
      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: undefined,
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(0);
    });

    it('returns empty array when webhook results are unsuccessful', async () => {
      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: false,
          error: 'Timeout',
          actions: [{ type: 'BUY', payload: { symbol: 'AAPL', quantity: 100 } }],
          responseTimeMs: 5000,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(0);
    });

    it('returns empty array when actions array is empty', async () => {
      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(0);
    });

    it('processes BUY actions and creates orders', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        marginUsed: '0.00',
        marginLimit: '50000.00',
        status: 'active',
      };

      const mockOrder = {
        id: 'order-123',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 100,
        status: 'pending',
      };

      // Mock agent lookup
      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      // Mock order insert
      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BUY', symbol: 'AAPL', quantity: 100 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[0].processed).toBe(1);
      expect(results[0].succeeded).toBe(1);
      expect(results[0].failed).toBe(0);
      expect(results[0].results[0].action).toBe('BUY');
      expect(results[0].results[0].success).toBe(true);
    });

    it('processes SELL actions and creates orders', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        marginUsed: '0.00',
        marginLimit: '50000.00',
        status: 'active',
      };

      const mockOrder = {
        id: 'order-456',
        agentId: 'agent-1',
        symbol: 'GOOG',
        side: 'SELL',
        orderType: 'LIMIT',
        quantity: 50,
        price: '2800.00',
        status: 'pending',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'SELL', symbol: 'GOOG', quantity: 50, orderType: 'LIMIT', price: 2800 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('SELL');
      expect(results[0].results[0].success).toBe(true);
    });

    it('handles validation errors for invalid actions', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([mockAgent]),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BUY', symbol: 'aapl', quantity: -100 }, // Invalid: lowercase symbol, negative quantity
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].processed).toBe(1);
      expect(results[0].succeeded).toBe(0);
      expect(results[0].failed).toBe(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toContain('Validation error');
    });

    it('skips processing for non-existent agents', async () => {
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([]), // Agent not found
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'non-existent-agent',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BUY', symbol: 'AAPL', quantity: 100 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].processed).toBe(0);
      expect(results[0].succeeded).toBe(0);
    });

    it('limits actions to 10 per agent per tick', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
      };

      const mockOrder = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 10,
        status: 'pending',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        })),
      }));

      // Create 15 actions
      const manyActions = Array.from({ length: 15 }, (_, i) => ({
        type: 'BUY' as const,
        symbol: 'AAPL',
        quantity: 10,
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: manyActions,
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      // Should only process 10 actions, not 15
      expect(results[0].processed).toBe(10);
    });

    it('processes CANCEL_ORDER actions', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      const mockOrder = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        agentId: 'agent-1',
        symbol: 'AAPL',
        status: 'pending',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            if (selectCallCount === 2) {
              return Promise.resolve([mockOrder]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'CANCEL_ORDER', orderId: '550e8400-e29b-41d4-a716-446655440000' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('CANCEL_ORDER');
      expect(results[0].results[0].success).toBe(true);
    });

    it('rejects CANCEL_ORDER for orders owned by other agents', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      const mockOrder = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        agentId: 'agent-2', // Different agent owns this order
        symbol: 'AAPL',
        status: 'pending',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            if (selectCallCount === 2) {
              return Promise.resolve([mockOrder]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'CANCEL_ORDER', orderId: '550e8400-e29b-41d4-a716-446655440000' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Not your order');
    });

    it('processes multiple agents with actions', async () => {
      const mockAgent1 = { id: 'agent-1', name: 'Agent 1', cash: '10000.00', status: 'active' };
      const mockAgent2 = { id: 'agent-2', name: 'Agent 2', cash: '20000.00', status: 'active' };

      const mockOrder1 = { id: 'order-1', agentId: 'agent-1', symbol: 'AAPL', side: 'BUY', orderType: 'MARKET', quantity: 100, status: 'pending' };
      const mockOrder2 = { id: 'order-2', agentId: 'agent-2', symbol: 'GOOG', side: 'SELL', orderType: 'MARKET', quantity: 50, status: 'pending' };

      // Agent lookups happen sequentially: agent-1 then agent-2
      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) return Promise.resolve([mockAgent1]);
            if (selectCallCount === 2) return Promise.resolve([mockAgent2]);
            return Promise.resolve([]);
          }),
        })),
      }));

      // Each insert call returns appropriate mock data
      // Always return a valid order for both order inserts
      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockOrder1]), // All inserts get valid mock
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [{ type: 'BUY', symbol: 'AAPL', quantity: 100 }],
          responseTimeMs: 50,
        },
        {
          agentId: 'agent-2',
          success: true,
          statusCode: 200,
          actions: [{ type: 'SELL', symbol: 'GOOG', quantity: 50 }],
          responseTimeMs: 60,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(2);
      expect(results[0].agentId).toBe('agent-1');
      expect(results[0].succeeded).toBe(1);
      expect(results[1].agentId).toBe('agent-2');
      expect(results[1].succeeded).toBe(1);
    });

    it('processes BRIBE action and deducts cash', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 1000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('BRIBE');
      expect(results[0].results[0].success).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });

    it('rejects BRIBE action when insufficient funds', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '500.00', // Less than bribe amount
        status: 'active',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 1000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Insufficient funds');
    });

    it('processes FLEE action and updates agent status', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      }));

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'FLEE', destination: 'Monaco' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('FLEE');
      expect(results[0].results[0].success).toBe(true);
      expect(results[0].results[0].data?.destination).toBe('Monaco');
      expect(db.update).toHaveBeenCalled();
    });

    it('logs all actions to the actions table', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      const mockOrder = {
        id: 'order-1',
        agentId: 'agent-1',
        symbol: 'AAPL',
        side: 'BUY',
        orderType: 'MARKET',
        quantity: 100,
        status: 'pending',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      let insertCallCount = 0;
      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => {
          insertCallCount++;
          return {
            returning: vi.fn().mockResolvedValue(insertCallCount === 1 ? [mockOrder] : []),
          };
        }),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [{ type: 'BUY', symbol: 'AAPL', quantity: 100 }],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // Should have at least 2 inserts: one for order, one for action log
      expect(db.insert).toHaveBeenCalledTimes(2);
    });
  });
});
