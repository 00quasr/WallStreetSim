import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock the sentiment analysis and rumor impact functions from @wallstreetsim/utils
vi.mock('@wallstreetsim/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wallstreetsim/utils')>();
  return {
    ...actual,
    calculateRumorImpact: vi.fn((text: string) => {
      // Simple mock: negative words = negative sentiment/impact
      const lowerText = text.toLowerCase();
      if (lowerText.includes('recall') || lowerText.includes('bug') || lowerText.includes('fraud') || lowerText.includes('crash') || lowerText.includes('scandal')) {
        return {
          impact: -0.02,
          duration: 10,
          sentiment: { score: -0.5, scoreString: '-0.5000', label: 'negative', positiveCount: 0, negativeCount: 2, confidence: 0.5 },
        };
      }
      if (lowerText.includes('acquiring') || lowerText.includes('deal') || lowerText.includes('surge') || lowerText.includes('profit')) {
        return {
          impact: 0.02,
          duration: 10,
          sentiment: { score: 0.5, scoreString: '0.5000', label: 'positive', positiveCount: 2, negativeCount: 0, confidence: 0.5 },
        };
      }
      return {
        impact: 0,
        duration: 10,
        sentiment: { score: 0, scoreString: '0.0000', label: 'neutral', positiveCount: 0, negativeCount: 0, confidence: 0 },
      };
    }),
    generateUUID: vi.fn(() => 'mock-uuid-12345'),
  };
});

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
  agents: { id: 'id', cash: 'cash', status: 'status', reputation: 'reputation', role: 'role', metadata: 'metadata' },
  orders: { id: 'id', agentId: 'agent_id', status: 'status' },
  actions: {},
  news: { id: 'id' },
  messages: { id: 'id', senderId: 'sender_id', recipientId: 'recipient_id', content: 'content' },
  investigations: { id: 'id', agentId: 'agent_id', crimeType: 'crime_type', status: 'status' },
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

    it('processes BRIBE action successfully when accepted', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
      };

      const mockSECAgent = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'sec_investigator',
        status: 'active',
        reputation: 30, // Low reputation = more corruptible
        cash: '50000.00',
        metadata: {},
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
              return Promise.resolve([mockSECAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'message-123' }]),
        })),
      }));

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      // Mock Math.random to ensure bribe is accepted (detection probability ~0.22)
      const originalRandom = Math.random;
      Math.random = () => 0.5; // Above detection probability, so bribe is accepted

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 50000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);
      Math.random = originalRandom;

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('BRIBE');
      expect(results[0].results[0].success).toBe(true);
      expect(results[0].results[0].data?.detected).toBe(false);
      expect(db.update).toHaveBeenCalled();
    });

    it('rejects BRIBE action when insufficient funds', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '500.00', // Less than bribe amount
        status: 'active',
        reputation: 50,
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
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 5000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Insufficient funds');
    });

    it('rejects BRIBE action when target is not SEC investigator', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
      };

      const mockNonSECAgent = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'hedge_fund_manager', // Not an SEC investigator
        status: 'active',
        reputation: 50,
        cash: '1000000.00',
        metadata: {},
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
              return Promise.resolve([mockNonSECAgent]);
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
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 5000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Can only bribe SEC investigators');
    });

    it('rejects BRIBE action when target agent not found', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]); // Target not found
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
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 5000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Target agent not found');
    });

    it('rejects BRIBE action when trying to bribe yourself', async () => {
      const agentUuid = '550e8400-e29b-41d4-a716-446655440001';
      const mockAgent = {
        id: agentUuid,
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
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
          agentId: agentUuid,
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BRIBE', targetAgent: agentUuid, amount: 5000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Cannot bribe yourself');
    });

    it('rejects BRIBE action when amount is below minimum', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
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
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 500 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Minimum bribe amount is $1000');
    });

    it('opens investigation when BRIBE is detected', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
      };

      const mockSECAgent = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'sec_investigator',
        status: 'active',
        reputation: 80, // High reputation = more likely to reject
        cash: '50000.00',
        metadata: {},
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
              return Promise.resolve([mockSECAgent]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'investigation-123' }]),
      });

      (db.insert as Mock).mockImplementation(() => ({
        values: insertValuesMock,
      }));

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      // Mock Math.random to ensure bribe is detected (detection probability ~0.62)
      const originalRandom = Math.random;
      Math.random = () => 0.1; // Below detection probability, so bribe is detected

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 5000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);
      Math.random = originalRandom;

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('BRIBE');
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].data?.detected).toBe(true);
      expect(results[0].results[0].data?.investigationOpened).toBe(true);

      // Verify investigation was created
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          crimeType: 'bribery',
          status: 'open',
          tickOpened: 100,
        })
      );
    });

    it('rejects BRIBE action when SEC investigator is not active', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '100000.00',
        status: 'active',
        reputation: 50,
      };

      const mockSECAgent = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        role: 'sec_investigator',
        status: 'imprisoned', // Not active
        reputation: 50,
        cash: '50000.00',
        metadata: {},
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
              return Promise.resolve([mockSECAgent]);
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
            { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 5000 },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Cannot bribe agent with status: imprisoned');
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

    it('processes RUMOR action successfully', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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
          returning: vi.fn().mockResolvedValue([{ id: 'news-123' }]),
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
            { type: 'RUMOR', targetSymbol: 'AAPL', content: 'Apple is secretly working on a flying car project!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('RUMOR');
      expect(results[0].results[0].success).toBe(true);
      expect(results[0].results[0].data?.symbol).toBe('AAPL');
      expect(results[0].results[0].data?.reputationCost).toBe(5);
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it('rejects RUMOR action when insufficient reputation', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 2, // Less than required 5
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
            { type: 'RUMOR', targetSymbol: 'GOOG', content: 'Google is being investigated for antitrust violations!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('RUMOR');
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Insufficient reputation');
    });

    it('deducts reputation after spreading rumor', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      (db.update as Mock).mockImplementation(() => ({
        set: updateSetMock,
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'news-456' }]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'RUMOR', targetSymbol: 'TSLA', content: 'Tesla recalls all vehicles due to software bug!' },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      expect(updateSetMock).toHaveBeenCalledWith({ reputation: 45 });
    });

    it('creates news entry with rumor content', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }));

      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'news-789' }]),
      });

      (db.insert as Mock).mockImplementation(() => ({
        values: insertValuesMock,
      }));

      const rumorContent = 'NVIDIA acquiring AMD in secret deal!';
      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'RUMOR', targetSymbol: 'NVDA', content: rumorContent },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: 100,
          headline: `RUMOR: ${rumorContent}`,
          content: rumorContent,
          category: 'rumor',
          symbols: 'NVDA',
          agentIds: 'agent-1',
          sentiment: '0.5000', // Positive sentiment due to "acquiring" and "deal"
        })
      );
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

    it('processes MESSAGE action successfully', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      const mockRecipient = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
      };

      const mockMessage = {
        id: 'message-123',
        senderId: 'agent-1',
        recipientId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Hello, want to form an alliance?',
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
              return Promise.resolve([mockRecipient]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockMessage]),
        })),
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'MESSAGE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', content: 'Hello, want to form an alliance?' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('MESSAGE');
      expect(results[0].results[0].success).toBe(true);
      expect(results[0].results[0].message).toBe('Message sent');
      expect(results[0].results[0].data?.messageId).toBe('message-123');
      expect(results[0].results[0].data?.targetAgent).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('rejects MESSAGE action when target agent not found', async () => {
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
            // Target agent not found
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
            { type: 'MESSAGE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', content: 'Hello there!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('MESSAGE');
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Target agent not found');
    });

    it('rejects MESSAGE action when target agent is not active', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      const mockRecipient = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'imprisoned', // Target is imprisoned
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
              return Promise.resolve([mockRecipient]);
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
            { type: 'MESSAGE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', content: 'Hello there!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('MESSAGE');
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Cannot message agent with status: imprisoned');
    });

    it('rejects MESSAGE action when sending to self', async () => {
      const agentUuid = '550e8400-e29b-41d4-a716-446655440001';
      const mockAgent = {
        id: agentUuid,
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

      const webhookResults: WebhookResult[] = [
        {
          agentId: agentUuid,
          success: true,
          statusCode: 200,
          actions: [
            { type: 'MESSAGE', targetAgent: agentUuid, content: 'Talking to myself...' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('MESSAGE');
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Cannot send message to yourself');
    });

    it('stores message with correct channel and content', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
      };

      const mockRecipient = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active',
      };

      const mockMessage = {
        id: 'message-456',
        senderId: 'agent-1',
        recipientId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Secret trading tip: buy AAPL!',
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
              return Promise.resolve([mockRecipient]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockMessage]),
      });

      (db.insert as Mock).mockImplementation(() => ({
        values: insertValuesMock,
      }));

      const messageContent = 'Secret trading tip: buy AAPL!';
      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            { type: 'MESSAGE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', content: messageContent },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // First insert call should be for the message
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: 100,
          senderId: 'agent-1',
          recipientId: '550e8400-e29b-41d4-a716-446655440000',
          channel: 'direct',
          content: messageContent,
        })
      );
    });

    it('processes WHISTLEBLOW action successfully', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Shady Trader',
        status: 'active',
        reputation: 60,
      };

      const mockInvestigation = {
        id: '660e8400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        crimeType: 'whistleblower_report',
        status: 'open',
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]); // Initial agent lookup
            }
            if (selectCallCount === 2) {
              return Promise.resolve([mockTarget]); // Target agent lookup
            }
            if (selectCallCount === 3) {
              return Promise.resolve([{ reputation: 50 }]); // Whistleblower reputation lookup
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockInvestigation]),
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
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'I witnessed this agent engage in pump and dump schemes on MEME stock',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].action).toBe('WHISTLEBLOW');
      expect(results[0].results[0].success).toBe(true);
      expect(results[0].results[0].message).toContain('Investigation opened');
      expect(results[0].results[0].data?.targetAgent).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(results[0].results[0].data?.investigationId).toBe('660e8400-e29b-41d4-a716-446655440000');
      expect(results[0].results[0].data?.whistleblowerReputationGain).toBe(3);
      expect(results[0].results[0].data?.targetReputationLoss).toBe(5);
    });

    it('rejects WHISTLEBLOW action when trying to report yourself', async () => {
      const agentUuid = '550e8400-e29b-41d4-a716-446655440001';
      const mockAgent = {
        id: agentUuid,
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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
          agentId: agentUuid,
          success: true,
          statusCode: 200,
          actions: [
            {
              type: 'WHISTLEBLOW',
              targetAgent: agentUuid,
              evidence: 'Trying to report myself for some reason',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Cannot report yourself');
    });

    it('rejects WHISTLEBLOW action when target agent not found', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      let selectCallCount = 0;
      (db.select as Mock).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAgent]);
            }
            return Promise.resolve([]); // Target not found
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
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'Evidence of fraudulent trading activity',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Target agent not found');
    });

    it('rejects WHISTLEBLOW action when target agent is not active', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Imprisoned Trader',
        status: 'imprisoned',
        reputation: 10,
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
              return Promise.resolve([mockTarget]);
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
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'Evidence of past fraudulent activity',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].success).toBe(false);
      expect(results[0].results[0].message).toBe('Cannot report agent with status: imprisoned');
    });

    it('creates investigation record with whistleblower evidence', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Suspect Trader',
        status: 'active',
        reputation: 70,
      };

      const mockInvestigation = {
        id: '770e8400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        crimeType: 'whistleblower_report',
        status: 'open',
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
              return Promise.resolve([mockTarget]);
            }
            if (selectCallCount === 3) {
              return Promise.resolve([{ reputation: 50 }]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockInvestigation]),
      });

      (db.insert as Mock).mockImplementation(() => ({
        values: insertValuesMock,
      }));

      (db.update as Mock).mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      const evidenceText = 'Detailed evidence of market manipulation including specific dates and trades';
      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: evidenceText,
            },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // First insert should be for the investigation
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: '550e8400-e29b-41d4-a716-446655440000',
          crimeType: 'whistleblower_report',
          status: 'open',
          tickOpened: 100,
        })
      );
    });

    it('updates reputation for both whistleblower and target', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Target Trader',
        status: 'active',
        reputation: 80,
      };

      const mockInvestigation = {
        id: '880e8400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        crimeType: 'whistleblower_report',
        status: 'open',
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
              return Promise.resolve([mockTarget]);
            }
            if (selectCallCount === 3) {
              return Promise.resolve([{ reputation: 50 }]); // Whistleblower reputation
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockInvestigation]),
        })),
      }));

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      (db.update as Mock).mockImplementation(() => ({
        set: updateSetMock,
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'Evidence of insider trading with documented proof',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // Whistleblower gains +3 reputation (50 + 3 = 53)
      expect(updateSetMock).toHaveBeenCalledWith({ reputation: 53 });
      // Target loses -5 reputation (80 - 5 = 75)
      expect(updateSetMock).toHaveBeenCalledWith({ reputation: 75 });
    });

    it('sends notification messages to both parties', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Target Trader',
        status: 'active',
        reputation: 60,
      };

      const mockInvestigation = {
        id: '990e8400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        crimeType: 'whistleblower_report',
        status: 'open',
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
              return Promise.resolve([mockTarget]);
            }
            if (selectCallCount === 3) {
              return Promise.resolve([{ reputation: 50 }]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockInvestigation]),
      });

      (db.insert as Mock).mockImplementation(() => ({
        values: insertValuesMock,
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
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'Clear evidence of securities fraud',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // Should have sent message to whistleblower (confirmation)
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: 100,
          recipientId: 'agent-1',
          channel: 'system',
        })
      );

      // Should have sent message to target (notification)
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: 100,
          recipientId: '550e8400-e29b-41d4-a716-446655440000',
          channel: 'system',
        })
      );
    });

    it('caps whistleblower reputation at 100', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'High Rep Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 99, // Near max
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Target Trader',
        status: 'active',
        reputation: 50,
      };

      const mockInvestigation = {
        id: 'aaa08400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        crimeType: 'whistleblower_report',
        status: 'open',
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
              return Promise.resolve([mockTarget]);
            }
            if (selectCallCount === 3) {
              return Promise.resolve([{ reputation: 99 }]); // High reputation
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockInvestigation]),
        })),
      }));

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      (db.update as Mock).mockImplementation(() => ({
        set: updateSetMock,
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'Evidence of market manipulation scheme',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // Reputation should be capped at 100 (99 + 3 would be 102, but capped)
      expect(updateSetMock).toHaveBeenCalledWith({ reputation: 100 });
    });

    it('floors target reputation at 0', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
      };

      const mockTarget = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Low Rep Trader',
        status: 'active',
        reputation: 3, // Very low reputation
      };

      const mockInvestigation = {
        id: 'bbb08400-e29b-41d4-a716-446655440000',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        crimeType: 'whistleblower_report',
        status: 'open',
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
              return Promise.resolve([mockTarget]);
            }
            if (selectCallCount === 3) {
              return Promise.resolve([{ reputation: 50 }]);
            }
            return Promise.resolve([]);
          }),
        })),
      }));

      (db.insert as Mock).mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([mockInvestigation]),
        })),
      }));

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      (db.update as Mock).mockImplementation(() => ({
        set: updateSetMock,
      }));

      const webhookResults: WebhookResult[] = [
        {
          agentId: 'agent-1',
          success: true,
          statusCode: 200,
          actions: [
            {
              type: 'WHISTLEBLOW',
              targetAgent: '550e8400-e29b-41d4-a716-446655440000',
              evidence: 'Conclusive evidence of fraudulent activity',
            },
          ],
          responseTimeMs: 50,
        },
      ];

      await processWebhookActions(webhookResults, 100);

      // Target reputation should be floored at 0 (3 - 5 would be -2, but floored)
      expect(updateSetMock).toHaveBeenCalledWith({ reputation: 0 });
    });

    it('returns market events for positive rumors', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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
          returning: vi.fn().mockResolvedValue([{ id: 'news-123' }]),
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
            { type: 'RUMOR', targetSymbol: 'AAPL', content: 'Apple acquiring massive company in secret deal!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].marketEvents).toHaveLength(1);

      const marketEvent = results[0].marketEvents[0];
      expect(marketEvent.type).toBe('RUMOR');
      expect(marketEvent.symbol).toBe('AAPL');
      expect(marketEvent.impact).toBe(0.02); // Positive impact from mock
      expect(marketEvent.duration).toBe(10);
      expect(marketEvent.tick).toBe(100);
      expect(marketEvent.headline).toBe('RUMOR: Apple acquiring massive company in secret deal!');
    });

    it('returns market events for negative rumors', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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
          returning: vi.fn().mockResolvedValue([{ id: 'news-456' }]),
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
            { type: 'RUMOR', targetSymbol: 'GOOG', content: 'CEO caught in massive fraud scandal!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].marketEvents).toHaveLength(1);

      const marketEvent = results[0].marketEvents[0];
      expect(marketEvent.type).toBe('RUMOR');
      expect(marketEvent.symbol).toBe('GOOG');
      expect(marketEvent.impact).toBe(-0.02); // Negative impact from mock
      expect(marketEvent.duration).toBe(10);
    });

    it('does not return market event for neutral rumors', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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
          returning: vi.fn().mockResolvedValue([{ id: 'news-789' }]),
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
            { type: 'RUMOR', targetSymbol: 'MSFT', content: 'The company held a meeting yesterday' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].marketEvents).toHaveLength(0); // No market event for neutral rumor
    });

    it('includes impact and duration in action result data', async () => {
      const mockAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        cash: '10000.00',
        status: 'active',
        reputation: 50,
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
          returning: vi.fn().mockResolvedValue([{ id: 'news-abc' }]),
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
            { type: 'RUMOR', targetSymbol: 'TSLA', content: 'Tesla stock price surge expected!' },
          ],
          responseTimeMs: 50,
        },
      ];

      const results = await processWebhookActions(webhookResults, 100);

      expect(results).toHaveLength(1);
      expect(results[0].results[0].data?.impact).toBe(0.02);
      expect(results[0].results[0].data?.duration).toBe(10);
    });
  });
});
