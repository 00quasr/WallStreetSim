import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  processAction,
  logAction,
  type ActionResult,
  type ProcessActionContext,
} from './action-processor';

vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  agents: {
    id: 'id',
    cash: 'cash',
    reputation: 'reputation',
    status: 'status',
    $inferSelect: {},
  },
  orders: {
    id: 'id',
    agentId: 'agent_id',
    status: 'status',
  },
  actions: {
    tick: 'tick',
    agentId: 'agent_id',
    actionType: 'action_type',
  },
  messages: {
    id: 'id',
  },
  investigations: {
    id: 'id',
    agentId: 'agent_id',
    status: 'status',
  },
  alliances: {
    id: 'id',
  },
  news: {
    id: 'id',
  },
}));

import { db } from '@wallstreetsim/db';

const createMockAgent = (overrides = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'TestAgent',
  role: 'retail_trader',
  apiKeyHash: 'test-hash',
  callbackUrl: null,
  webhookSecret: null,
  allianceId: null,
  cash: '100000',
  marginUsed: '0',
  marginLimit: '10000',
  status: 'active',
  reputation: 50,
  webhookFailures: 0,
  lastWebhookError: null,
  lastWebhookSuccessAt: null,
  lastResponseTimeMs: null,
  avgResponseTimeMs: null,
  webhookSuccessCount: 0,
  createdAt: new Date(),
  lastActiveAt: null,
  metadata: {},
  ...overrides,
});

const createMockContext = (agentOverrides = {}): ProcessActionContext => ({
  agentId: '550e8400-e29b-41d4-a716-446655440000',
  agent: createMockAgent(agentOverrides) as typeof import('@wallstreetsim/db').agents.$inferSelect,
  tick: 100,
});

describe('ActionProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('processAction - Trade Actions', () => {
    it('should process BUY action successfully', async () => {
      const mockOrder = {
        id: 'order-123',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 100,
        orderType: 'MARKET',
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'BUY',
        symbol: 'AAPL',
        quantity: 100,
        orderType: 'MARKET',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('BUY');
      expect(result.message).toBe('Order submitted');
      expect(result.data?.orderId).toBe('order-123');
    });

    it('should process SELL action successfully', async () => {
      const mockOrder = {
        id: 'order-456',
        symbol: 'GOOG',
        side: 'SELL',
        quantity: 50,
        orderType: 'LIMIT',
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'SELL',
        symbol: 'GOOG',
        quantity: 50,
        orderType: 'LIMIT',
        price: 150.00,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('SELL');
    });

    it('should reject trade with invalid quantity', async () => {
      const context = createMockContext();
      const result = await processAction(context, {
        type: 'BUY',
        symbol: 'AAPL',
        quantity: 0,
        orderType: 'MARKET',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid quantity');
    });

    it('should reject trade for inactive agent', async () => {
      const context = createMockContext({ status: 'bankrupt' });
      const result = await processAction(context, {
        type: 'BUY',
        symbol: 'AAPL',
        quantity: 100,
        orderType: 'MARKET',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('bankrupt');
    });

    it('should process SHORT action', async () => {
      const mockOrder = {
        id: 'order-789',
        symbol: 'TSLA',
        side: 'SELL',
        quantity: 25,
        orderType: 'MARKET',
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'SHORT',
        symbol: 'TSLA',
        quantity: 25,
        orderType: 'MARKET',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('SHORT');
    });

    it('should process COVER action', async () => {
      const mockOrder = {
        id: 'order-abc',
        symbol: 'TSLA',
        side: 'BUY',
        quantity: 25,
        orderType: 'MARKET',
      };

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'COVER',
        symbol: 'TSLA',
        quantity: 25,
        orderType: 'MARKET',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('COVER');
    });
  });

  describe('processAction - Cancel Order', () => {
    it('should cancel a pending order successfully', async () => {
      const mockOrder = {
        id: 'order-to-cancel',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'pending',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'CANCEL_ORDER',
        orderId: 'order-to-cancel',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order cancelled');
    });

    it('should reject cancellation of non-existent order', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'CANCEL_ORDER',
        orderId: 'non-existent-order',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Order not found');
    });

    it('should reject cancellation of another agents order', async () => {
      const mockOrder = {
        id: 'order-to-cancel',
        agentId: 'different-agent-id',
        status: 'pending',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'CANCEL_ORDER',
        orderId: 'order-to-cancel',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not your order');
    });

    it('should reject cancellation of filled order', async () => {
      const mockOrder = {
        id: 'order-to-cancel',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'filled',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockOrder]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'CANCEL_ORDER',
        orderId: 'order-to-cancel',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Order cannot be cancelled');
    });
  });

  describe('processAction - Rumor', () => {
    it('should process rumor action successfully', async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'news-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext({ reputation: 50 });
      const result = await processAction(context, {
        type: 'RUMOR',
        targetSymbol: 'AAPL',
        content: 'Apple is secretly working on a flying car project!',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('RUMOR');
      expect(result.data?.symbol).toBe('AAPL');
      expect(result.data?.reputationCost).toBe(5);
    });

    it('should reject rumor with insufficient reputation', async () => {
      const context = createMockContext({ reputation: 2 });
      const result = await processAction(context, {
        type: 'RUMOR',
        targetSymbol: 'AAPL',
        content: 'Apple is secretly working on a flying car project!',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Insufficient reputation');
    });

    it('should deduct reputation after spreading rumor', async () => {
      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      vi.mocked(db.update).mockReturnValue({
        set: updateSetMock,
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'news-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext({ reputation: 50 });
      await processAction(context, {
        type: 'RUMOR',
        targetSymbol: 'GOOG',
        content: 'Google is being investigated for antitrust violations!',
      });

      expect(updateSetMock).toHaveBeenCalledWith({ reputation: 45 });
    });

    it('should create news entry with rumor content', async () => {
      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'news-456' }]),
      });

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: insertValuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext({ reputation: 50 });
      const rumorContent = 'Tesla recalls all vehicles due to software bug!';
      await processAction(context, {
        type: 'RUMOR',
        targetSymbol: 'TSLA',
        content: rumorContent,
      });

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tick: 100,
          headline: `RUMOR: ${rumorContent.substring(0, 100)}`,
          content: rumorContent,
          category: 'rumor',
          symbols: 'TSLA',
          agentIds: context.agentId,
          sentiment: '0',
        })
      );
    });

    it('should truncate long rumor content in headline', async () => {
      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'news-789' }]),
      });

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: insertValuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext({ reputation: 50 });
      const longRumorContent = 'A'.repeat(200);
      await processAction(context, {
        type: 'RUMOR',
        targetSymbol: 'META',
        content: longRumorContent,
      });

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headline: `RUMOR: ${'A'.repeat(100)}`,
          content: longRumorContent,
        })
      );
    });
  });

  describe('processAction - Message', () => {
    it('should send message successfully', async () => {
      const mockRecipient = createMockAgent({ id: 'recipient-id' });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockRecipient]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'message-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'MESSAGE',
        targetAgent: 'recipient-id',
        content: 'Hello fellow trader!',
      });

      expect(result.success).toBe(true);
      expect(result.data?.messageId).toBe('message-123');
    });

    it('should reject message to non-existent agent', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'MESSAGE',
        targetAgent: 'non-existent-id',
        content: 'Hello!',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Recipient not found');
    });
  });

  describe('processAction - Ally', () => {
    it('should send alliance request successfully', async () => {
      const mockTarget = createMockAgent({ id: 'target-id', status: 'active' });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTarget]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'alliance-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY',
        targetAgent: 'target-id',
        proposal: 'Let us coordinate our trades for mutual benefit.',
      });

      expect(result.success).toBe(true);
      expect(result.data?.allianceId).toBe('alliance-123');
    });

    it('should reject alliance with inactive agent', async () => {
      const mockTarget = createMockAgent({ id: 'target-id', status: 'bankrupt' });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTarget]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY',
        targetAgent: 'target-id',
        proposal: 'Let us work together.',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Target agent is not active');
    });

    it('should reject alliance request to self', async () => {
      const context = createMockContext();

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const result = await processAction(context, {
        type: 'ALLY',
        targetAgent: 'non-existent-agent',
        proposal: 'Let us work together on this.',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Target agent not found');
    });
  });

  describe('processAction - Ally Accept', () => {
    it('should accept pending alliance successfully', async () => {
      const mockAlliance = { id: 'alliance-123', status: 'pending' };
      const mockMessage = {
        id: 'msg-123',
        senderId: 'proposer-id',
        recipientId: '550e8400-e29b-41d4-a716-446655440000',
        channel: 'alliance',
        subject: 'Alliance Proposal (alliance-123)',
      };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAlliance]);
            }
            return Promise.resolve([mockMessage]);
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'msg-456' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_ACCEPT',
        allianceId: 'alliance-123',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('ALLY_ACCEPT');
      expect(result.message).toBe('Alliance formed');
      expect(result.data?.allianceId).toBe('alliance-123');
      expect(result.data?.partnerId).toBe('proposer-id');
    });

    it('should reject accepting non-existent alliance', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_ACCEPT',
        allianceId: 'non-existent-alliance',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alliance not found');
    });

    it('should reject accepting already active alliance', async () => {
      const mockAlliance = { id: 'alliance-123', status: 'active' };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAlliance]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_ACCEPT',
        allianceId: 'alliance-123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alliance is not pending');
    });

    it('should reject accepting alliance without proposal message', async () => {
      const mockAlliance = { id: 'alliance-123', status: 'pending' };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAlliance]);
            }
            return Promise.resolve([]);
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_ACCEPT',
        allianceId: 'alliance-123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alliance proposal not found');
    });
  });

  describe('processAction - Ally Reject', () => {
    it('should reject pending alliance successfully', async () => {
      const mockAlliance = { id: 'alliance-456', status: 'pending' };
      const mockMessage = {
        id: 'msg-123',
        senderId: 'proposer-id',
        recipientId: '550e8400-e29b-41d4-a716-446655440000',
        channel: 'alliance',
        subject: 'Alliance Proposal (alliance-456)',
      };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAlliance]);
            }
            return Promise.resolve([mockMessage]);
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'msg-789' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_REJECT',
        allianceId: 'alliance-456',
        reason: 'I prefer to work alone.',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('ALLY_REJECT');
      expect(result.message).toBe('Alliance proposal rejected');
      expect(result.data?.allianceId).toBe('alliance-456');
      expect(result.data?.proposerId).toBe('proposer-id');
    });

    it('should reject non-existent alliance', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_REJECT',
        allianceId: 'non-existent-alliance',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alliance not found');
    });

    it('should reject already dissolved alliance', async () => {
      const mockAlliance = { id: 'alliance-456', status: 'dissolved' };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAlliance]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'ALLY_REJECT',
        allianceId: 'alliance-456',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Alliance is not pending');
    });

    it('should use default rejection reason when none provided', async () => {
      const mockAlliance = { id: 'alliance-789', status: 'pending' };
      const mockMessage = {
        id: 'msg-123',
        senderId: 'proposer-id',
        recipientId: '550e8400-e29b-41d4-a716-446655440000',
        channel: 'alliance',
        subject: 'Alliance Proposal (alliance-789)',
      };

      let selectCallCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return Promise.resolve([mockAlliance]);
            }
            return Promise.resolve([mockMessage]);
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      vi.mocked(db.update).mockReturnValue({
        set: updateSetMock,
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'msg-abc' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      await processAction(context, {
        type: 'ALLY_REJECT',
        allianceId: 'alliance-789',
      });

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'dissolved',
          dissolutionReason: 'Proposal rejected',
        })
      );
    });
  });

  describe('processAction - Bribe', () => {
    it('should process bribe successfully', async () => {
      const mockTarget = createMockAgent({ id: 'target-id', cash: '50000' });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTarget]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'investigation-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext({ cash: '100000' });
      const result = await processAction(context, {
        type: 'BRIBE',
        targetAgent: 'target-id',
        amount: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.amount).toBe(10000);
    });

    it('should reject bribe with insufficient funds', async () => {
      const context = createMockContext({ cash: '5000' });
      const result = await processAction(context, {
        type: 'BRIBE',
        targetAgent: 'target-id',
        amount: 10000,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Insufficient funds');
    });
  });

  describe('processAction - Whistleblow', () => {
    it('should file whistleblower report successfully', async () => {
      const mockTarget = createMockAgent({ id: 'target-id' });
      const mockAgent = createMockAgent({ reputation: 50 });

      let callCount = 0;
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return Promise.resolve([mockTarget]);
            }
            return Promise.resolve([mockAgent]);
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'investigation-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'WHISTLEBLOW',
        targetAgent: 'target-id',
        evidence: 'I observed suspicious trading patterns indicating insider trading.',
      });

      expect(result.success).toBe(true);
      expect(result.data?.investigationId).toBe('investigation-123');
    });
  });

  describe('processAction - Flee', () => {
    it('should reject flee when not under investigation', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const context = createMockContext();
      const result = await processAction(context, {
        type: 'FLEE',
        destination: 'Cayman Islands',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No reason to flee');
    });

    it('should process flee attempt when under investigation', async () => {
      const mockInvestigation = {
        id: 'investigation-123',
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'open',
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockInvestigation]),
        }),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const context = createMockContext({ cash: '1000000' });
      const result = await processAction(context, {
        type: 'FLEE',
        destination: 'Switzerland',
      });

      expect(result.action).toBe('FLEE');
      expect(result.data?.destination).toBe('Switzerland');
    });
  });

  describe('processAction - Unknown Action', () => {
    it('should return error for unknown action type', async () => {
      const context = createMockContext();
      const result = await processAction(context, {
        type: 'UNKNOWN_ACTION',
      } as unknown as Parameters<typeof processAction>[1]);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown action type');
    });
  });

  describe('logAction', () => {
    it('should log action to database', async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'action-log-123' }]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const action = {
        type: 'BUY' as const,
        symbol: 'AAPL',
        quantity: 100,
        orderType: 'MARKET' as const,
      };
      const result: ActionResult = {
        action: 'BUY',
        success: true,
        message: 'Order submitted',
        data: { orderId: 'order-123' },
      };

      await logAction(context, action, result);

      expect(db.insert).toHaveBeenCalled();
    });

    it('should log RUMOR action with target symbol', async () => {
      const insertValuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'action-log-456' }]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values: insertValuesMock,
      } as unknown as ReturnType<typeof db.insert>);

      const context = createMockContext();
      const action = {
        type: 'RUMOR' as const,
        targetSymbol: 'NVDA',
        content: 'NVIDIA acquiring AMD in secret deal!',
      };
      const result: ActionResult = {
        action: 'RUMOR',
        success: true,
        message: 'Rumor spreading...',
        data: { symbol: 'NVDA', reputationCost: 5 },
      };

      await logAction(context, action, result);

      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'RUMOR',
          targetSymbol: 'NVDA',
        })
      );
    });
  });
});
