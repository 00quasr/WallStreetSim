import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture the SQL template used in the update
let capturedSql: string | null = null;

// Mock drizzle-orm to capture the SQL
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm');
  return {
    ...actual,
    sql: new Proxy((strings: TemplateStringsArray, ...values: unknown[]) => {
      // Reconstruct the SQL string to capture it
      let result = strings[0];
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        // Check if value is a column reference or a literal
        if (typeof value === 'object' && value !== null && 'name' in value) {
          result += `[column:${(value as { name: string }).name}]`;
        } else {
          result += String(value);
        }
        result += strings[i + 1];
      }
      capturedSql = result;

      // Return a mock that behaves like a SQL object
      return {
        _sql: result,
        mapWith: vi.fn().mockReturnThis(),
      };
    }, {
      get(target, prop) {
        if (prop === 'raw') {
          return (value: string) => ({ _raw: value });
        }
        return target[prop as keyof typeof target];
      },
    }),
    eq: vi.fn().mockReturnValue({}),
  };
});

// Mock the db module
vi.mock('@wallstreetsim/db', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  companies: {
    symbol: { name: 'symbol' },
    currentPrice: { name: 'current_price' },
    highPrice: { name: 'high_price' },
    lowPrice: { name: 'low_price' },
    marketCap: { name: 'market_cap' },
    sentiment: { name: 'sentiment' },
    manipulationScore: { name: 'manipulation_score' },
    sharesOutstanding: { name: 'shares_outstanding' },
  },
}));

vi.mock('@wallstreetsim/utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Price Update Bigint Fix', () => {
  beforeEach(() => {
    capturedSql = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('marketCap calculation uses numeric cast to prevent bigint type mismatch', async () => {
    // Import the module under test after mocks are set up
    const { updateCompanyPrice } = await import('../services/db');

    // Call the function with test data
    await updateCompanyPrice('AAPL', 150.1234, 155.5678, 145.0000, 0.5, 0.001);

    // Verify the SQL contains ::numeric cast for the price value
    expect(capturedSql).not.toBeNull();
    expect(capturedSql).toContain('::numeric');
    expect(capturedSql).toContain('[column:shares_outstanding]');

    // Verify the price is formatted with 4 decimal places
    expect(capturedSql).toContain('150.1234');
  });

  it('price value is formatted with toFixed(4) for proper decimal precision', async () => {
    const { updateCompanyPrice } = await import('../services/db');

    // Use a price that would have floating point precision issues
    await updateCompanyPrice('AAPL', 150.12345678, 155.5678, 145.0000, 0.5, 0.001);

    expect(capturedSql).not.toBeNull();
    // Should be truncated to 4 decimal places
    expect(capturedSql).toContain('150.1235');
  });

  it('multiplication expression is properly structured for PostgreSQL', async () => {
    const { updateCompanyPrice } = await import('../services/db');

    await updateCompanyPrice('GOOG', 2800.50, 2850.00, 2750.00, 0.3, 0.002);

    expect(capturedSql).not.toBeNull();
    // The SQL should look like: 2800.5000::numeric * shares_outstanding
    // This ensures the multiplication result is numeric, not bigint
    expect(capturedSql).toMatch(/\d+\.\d{4}::numeric \* \[column:shares_outstanding\]/);
  });
});
