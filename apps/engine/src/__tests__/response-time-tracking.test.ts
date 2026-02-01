import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock the database module
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
    lastResponseTimeMs: 'last_response_time_ms',
    avgResponseTimeMs: 'avg_response_time_ms',
    webhookSuccessCount: 'webhook_success_count',
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
  getAgentResponseTimeStats,
} from '../services/db';

describe('Response Time Tracking', () => {
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

  describe('recordWebhookSuccess with response time', () => {
    it('records response time for first successful webhook', async () => {
      // Agent has no previous response time data
      mockFromWhere.mockResolvedValueOnce([{
        avgResponseTimeMs: null,
        webhookSuccessCount: 0,
      }]);

      await recordWebhookSuccess('agent-123', 150);

      expect(db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookFailures: 0,
          lastWebhookError: null,
          lastWebhookSuccessAt: expect.any(Date),
          lastResponseTimeMs: 150,
          avgResponseTimeMs: 150, // First entry, avg = value
          webhookSuccessCount: 1,
        })
      );
    });

    it('calculates running average correctly', async () => {
      // Agent has 2 previous successes with avg of 100ms
      mockFromWhere.mockResolvedValueOnce([{
        avgResponseTimeMs: 100,
        webhookSuccessCount: 2,
      }]);

      await recordWebhookSuccess('agent-123', 250);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lastResponseTimeMs: 250,
          // New avg = ((100 * 2) + 250) / 3 = 450 / 3 = 150
          avgResponseTimeMs: 150,
          webhookSuccessCount: 3,
        })
      );
    });

    it('handles agent with null values gracefully', async () => {
      mockFromWhere.mockResolvedValueOnce([{
        avgResponseTimeMs: null,
        webhookSuccessCount: null,
      }]);

      await recordWebhookSuccess('agent-123', 200);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lastResponseTimeMs: 200,
          avgResponseTimeMs: 200,
          webhookSuccessCount: 1,
        })
      );
    });

    it('handles missing agent record gracefully', async () => {
      mockFromWhere.mockResolvedValueOnce([]);

      await recordWebhookSuccess('agent-123', 300);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          lastResponseTimeMs: 300,
          avgResponseTimeMs: 300,
          webhookSuccessCount: 1,
        })
      );
    });

    it('rounds average response time to integer', async () => {
      // Agent has 2 previous successes with avg of 100ms
      mockFromWhere.mockResolvedValueOnce([{
        avgResponseTimeMs: 100,
        webhookSuccessCount: 2,
      }]);

      // New value 101 would give avg of 100.333...
      await recordWebhookSuccess('agent-123', 101);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          // ((100 * 2) + 101) / 3 = 301 / 3 = 100.333... -> 100
          avgResponseTimeMs: 100,
        })
      );
    });

    it('updates correct agent by ID', async () => {
      mockFromWhere.mockResolvedValueOnce([{
        avgResponseTimeMs: 50,
        webhookSuccessCount: 1,
      }]);

      await recordWebhookSuccess('specific-agent-id', 100);

      expect(mockWhere).toHaveBeenCalled();
    });
  });

  describe('getAgentResponseTimeStats', () => {
    it('returns response time stats for an agent', async () => {
      mockFromWhere.mockResolvedValue([{
        lastResponseTimeMs: 150,
        avgResponseTimeMs: 120,
        webhookSuccessCount: 10,
      }]);

      const stats = await getAgentResponseTimeStats('agent-123');

      expect(stats).toEqual({
        lastResponseTimeMs: 150,
        avgResponseTimeMs: 120,
        webhookSuccessCount: 10,
      });
    });

    it('returns null values for agent without response time data', async () => {
      mockFromWhere.mockResolvedValue([{
        lastResponseTimeMs: null,
        avgResponseTimeMs: null,
        webhookSuccessCount: 0,
      }]);

      const stats = await getAgentResponseTimeStats('agent-123');

      expect(stats).toEqual({
        lastResponseTimeMs: null,
        avgResponseTimeMs: null,
        webhookSuccessCount: 0,
      });
    });

    it('returns default values when agent not found', async () => {
      mockFromWhere.mockResolvedValue([]);

      const stats = await getAgentResponseTimeStats('nonexistent-agent');

      expect(stats).toEqual({
        lastResponseTimeMs: null,
        avgResponseTimeMs: null,
        webhookSuccessCount: 0,
      });
    });

    it('handles undefined fields gracefully', async () => {
      mockFromWhere.mockResolvedValue([{
        lastResponseTimeMs: undefined,
        avgResponseTimeMs: undefined,
        webhookSuccessCount: undefined,
      }]);

      const stats = await getAgentResponseTimeStats('agent-123');

      expect(stats).toEqual({
        lastResponseTimeMs: null,
        avgResponseTimeMs: null,
        webhookSuccessCount: 0,
      });
    });
  });
});
