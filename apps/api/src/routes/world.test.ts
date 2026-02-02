import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { world } from './world';

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue('12345'),
    set: vi.fn(),
    quit: vi.fn(),
  })),
}));

// Mock database
vi.mock('@wallstreetsim/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([]),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    }),
  },
  worldState: { id: 'id' },
  agents: {
    id: 'id',
    name: 'name',
    status: 'status',
    cash: 'cash',
    role: 'role',
    reputation: 'reputation',
    imprisonedUntilTick: 'imprisoned_until_tick',
  },
  companies: {
    isPublic: 'is_public',
    marketCap: 'market_cap',
  },
  investigations: {
    id: 'id',
    agentId: 'agent_id',
    crimeType: 'crime_type',
    status: 'status',
    tickOpened: 'tick_opened',
    tickCharged: 'tick_charged',
    fineAmount: 'fine_amount',
    createdAt: 'created_at',
    sentenceYears: 'sentence_years',
    tickResolved: 'tick_resolved',
  },
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  sql: vi.fn(),
  count: vi.fn(() => 'count'),
  inArray: vi.fn((field, values) => ({ type: 'inArray', field, values })),
  desc: vi.fn((field) => ({ type: 'desc', field })),
}));

import { db } from '@wallstreetsim/db';

const mockWorldState = {
  id: 1,
  currentTick: 12345,
  marketOpen: true,
  regime: 'bull',
  interestRate: '5.25',
  inflationRate: '3.2',
  gdpGrowth: '2.5',
  lastTickAt: new Date(),
};

const mockInvestigation = (overrides = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440001',
  agentId: '550e8400-e29b-41d4-a716-446655440002',
  agentName: 'ShadowTrader',
  crimeType: 'insider_trading',
  status: 'charged',
  tickOpened: 10000,
  tickCharged: 10500,
  fineAmount: '1000000.00',
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

const mockPrisoner = (overrides = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440003',
  name: 'BernieBot',
  imprisonedUntilTick: 160000,
  investigationId: '550e8400-e29b-41d4-a716-446655440004',
  crimeType: 'accounting_fraud',
  sentenceYears: 150,
  fineAmount: '50000000.00',
  tickResolved: 10000,
  ...overrides,
});

describe('World Routes', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/world', world);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /world/status', () => {
    it('should return world status with agent counts', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            return {
              groupBy: vi.fn().mockResolvedValue([
                { status: 'active', count: 100 },
                { status: 'imprisoned', count: 5 },
                { status: 'bankrupt', count: 10 },
              ]),
            };
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      // Mock the first call for worldState
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockWorldState]),
          }),
        } as unknown as ReturnType<typeof db.select>)
        // Mock the second call for agent counts
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([
              { status: 'active', count: 100 },
              { status: 'imprisoned', count: 5 },
              { status: 'bankrupt', count: 10 },
            ]),
          }),
        } as unknown as ReturnType<typeof db.select>)
        // Mock the third call for market stats
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { totalMarketCap: '2400000000000', companyCount: 50 },
            ]),
          }),
        } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/status');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.tick).toBe(12345);
      expect(body.data.marketOpen).toBe(true);
      expect(body.data.regime).toBe('bull');
    });
  });

  describe('GET /world/investigations/most-wanted', () => {
    it('should return active investigations with agent names', async () => {
      const mockInvestigations = [
        mockInvestigation(),
        mockInvestigation({
          id: '550e8400-e29b-41d4-a716-446655440005',
          agentName: 'PumpKing',
          crimeType: 'market_manipulation',
          status: 'open',
        }),
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(mockInvestigations),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/investigations/most-wanted');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].agentName).toBe('ShadowTrader');
      expect(body.data[0].crimeType).toBe('insider_trading');
      expect(body.data[0].status).toBe('charged');
      expect(body.data[1].agentName).toBe('PumpKing');
      expect(body.data[1].crimeType).toBe('market_manipulation');
    });

    it('should return empty array when no active investigations', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/investigations/most-wanted');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockInvestigation()]),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/investigations/most-wanted?limit=5');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('should cap limit at 50', async () => {
      const limitMock = vi.fn().mockResolvedValue([]);
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: limitMock,
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      await app.request('/world/investigations/most-wanted?limit=100');

      expect(limitMock).toHaveBeenCalledWith(50);
    });

    it('should parse fineAmount as number', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([mockInvestigation({ fineAmount: '1000000.50' })]),
              }),
            }),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/investigations/most-wanted');

      const body = await res.json();
      expect(body.data[0].fineAmount).toBe(1000000.50);
    });
  });

  describe('GET /world/prison', () => {
    it('should return imprisoned agents with conviction details', async () => {
      const mockPrisoners = [mockPrisoner()];

      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(mockPrisoners),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 23 }]),
          }),
        } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/prison');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.prisoners).toHaveLength(1);
      expect(body.data.prisoners[0].agentName).toBe('BernieBot');
      expect(body.data.prisoners[0].sentenceYears).toBe(150);
      expect(body.data.totalCount).toBe(23);
    });

    it('should return empty array when no prisoners', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/prison');

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.prisoners).toHaveLength(0);
      expect(body.data.totalCount).toBe(0);
    });

    it('should parse fineAmount as number', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([mockPrisoner({ fineAmount: '50000000.75' })]),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        } as unknown as ReturnType<typeof db.select>);

      const res = await app.request('/world/prison');

      const body = await res.json();
      expect(body.data.prisoners[0].fineAmount).toBe(50000000.75);
    });

    it('should respect limit parameter', async () => {
      const limitMock = vi.fn().mockResolvedValue([]);
      vi.mocked(db.select)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: limitMock,
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 0 }]),
          }),
        } as unknown as ReturnType<typeof db.select>);

      await app.request('/world/prison?limit=3');

      expect(limitMock).toHaveBeenCalledWith(3);
    });
  });
});
