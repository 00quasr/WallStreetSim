import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock the database module - vi.mock is hoisted, so we use inline functions
vi.mock('@wallstreetsim/db', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  },
  agents: {
    id: 'id',
    webhookFailures: 'webhook_failures',
    lastWebhookError: 'last_webhook_error',
    lastWebhookSuccessAt: 'last_webhook_success_at',
  },
  companies: {},
  worldState: {},
  trades: {},
  orders: {},
  holdings: {},
  news: {},
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ column: col, value: val })),
  sql: vi.fn((template, ...values) => ({ template, values })),
  and: vi.fn(),
  isNotNull: vi.fn(),
  desc: vi.fn(),
  gt: vi.fn(),
  lt: vi.fn(),
}));

import { db } from '@wallstreetsim/db';
import {
  recordWebhookSuccess,
  recordWebhookFailure,
  getAgentWebhookFailures,
} from '../services/db';

describe('Webhook Failure Tracking', () => {
  let mockSet: Mock;
  let mockWhere: Mock;
  let mockFromWhere: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations for update chain
    mockWhere = vi.fn().mockResolvedValue(undefined);
    mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (db.update as Mock).mockReturnValue({ set: mockSet });

    // Reset mock implementations for select chain
    mockFromWhere = vi.fn().mockResolvedValue([]);
    (db.select as Mock).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: mockFromWhere,
      }),
    });
  });

  describe('recordWebhookSuccess', () => {
    it('resets failure count and error for the agent', async () => {
      await recordWebhookSuccess('agent-123');

      expect(db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookFailures: 0,
          lastWebhookError: null,
          lastWebhookSuccessAt: expect.any(Date),
        })
      );
    });

    it('updates the correct agent by ID', async () => {
      await recordWebhookSuccess('agent-456');

      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('recordWebhookFailure', () => {
    it('increments failure count and records error', async () => {
      await recordWebhookFailure('agent-123', 'Connection timeout');

      expect(db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lastWebhookError: 'Connection timeout',
        })
      );
    });

    it('updates the correct agent by ID', async () => {
      await recordWebhookFailure('agent-789', 'HTTP 500');

      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('getAgentWebhookFailures', () => {
    it('returns failure count for an agent', async () => {
      mockFromWhere.mockResolvedValue([{ webhookFailures: 5 }]);

      const count = await getAgentWebhookFailures('agent-123');

      expect(count).toBe(5);
    });

    it('returns 0 if agent not found', async () => {
      mockFromWhere.mockResolvedValue([]);

      const count = await getAgentWebhookFailures('nonexistent-agent');

      expect(count).toBe(0);
    });

    it('returns 0 if webhookFailures is undefined', async () => {
      mockFromWhere.mockResolvedValue([{ webhookFailures: undefined }]);

      const count = await getAgentWebhookFailures('agent-with-undefined');

      expect(count).toBe(0);
    });
  });
});
