import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// Hoist mock functions
const mockExecute = vi.fn();
const mockSelect = vi.fn();

// Mock the database
vi.mock('@wallstreetsim/db', () => ({
  db: {
    execute: () => mockExecute(),
    select: () => ({
      from: () => ({
        where: () => mockSelect(),
      }),
    }),
  },
  sql: (strings: TemplateStringsArray) => strings.join(''),
  agents: { status: 'status' },
  orders: { status: 'status' },
  trades: { executedAt: 'executed_at' },
  companies: { isPublic: 'is_public', tradingStatus: 'trading_status' },
  count: vi.fn(() => 'count'),
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  gte: vi.fn((a, b) => ({ field: a, value: b })),
  and: vi.fn((...args) => args),
}));

// Import after mocks are set up
import { metrics } from './metrics';

describe('Metrics Routes', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route('/metrics', metrics);
    vi.clearAllMocks();
    // Default successful responses
    mockExecute.mockResolvedValue([{ '?column?': 1 }]);
    mockSelect.mockResolvedValue([{ count: 10 }]);
  });

  describe('GET /metrics', () => {
    it('should return metrics in Prometheus text format', async () => {
      const res = await app.request('/metrics');

      expect(res.status).toBe(200);
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('text/plain');
    });

    it('should include default Node.js metrics', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('nodejs_');
      expect(body).toContain('process_');
    });

    it('should include custom wallstreetsim metrics', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_');
    });

    it('should include database connection status metric', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_db_connection_status');
    });

    it('should include process uptime metric', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_process_uptime_seconds');
    });

    it('should include active agents metric', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_active_agents_total');
    });

    it('should include pending orders metric', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_pending_orders_total');
    });

    it('should include active companies metric', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_active_companies_total');
    });

    it('should set database connection status to 1 when healthy', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);

      const res = await app.request('/metrics');
      const body = await res.text();

      // Find the line with db_connection_status
      const dbStatusMatch = body.match(/wallstreetsim_db_connection_status\s+(\d+)/);
      expect(dbStatusMatch).not.toBeNull();
      expect(dbStatusMatch![1]).toBe('1');
    });

    it('should set database connection status to 0 when unhealthy', async () => {
      mockExecute.mockRejectedValue(new Error('Connection refused'));

      const res = await app.request('/metrics');
      const body = await res.text();

      // Find the line with db_connection_status
      const dbStatusMatch = body.match(/wallstreetsim_db_connection_status\s+(\d+)/);
      expect(dbStatusMatch).not.toBeNull();
      expect(dbStatusMatch![1]).toBe('0');
    });

    it('should include HTTP request metrics definitions', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_http_requests_total');
      expect(body).toContain('wallstreetsim_http_request_duration_seconds');
    });

    it('should include websocket connections metric definition', async () => {
      const res = await app.request('/metrics');
      const body = await res.text();

      expect(body).toContain('wallstreetsim_websocket_connections_total');
    });

    it('should handle business metrics errors gracefully', async () => {
      mockExecute.mockResolvedValue([{ '?column?': 1 }]);
      mockSelect.mockRejectedValue(new Error('Query failed'));

      const res = await app.request('/metrics');

      expect(res.status).toBe(200);
      const body = await res.text();
      // Should still include metrics even if business queries fail
      expect(body).toContain('wallstreetsim_');
    });

    it('should have proper content-type for Prometheus', async () => {
      const res = await app.request('/metrics');
      const contentType = res.headers.get('content-type');

      // Prometheus expects text/plain with version info
      expect(contentType).toMatch(/text\/plain/);
    });
  });
});
