import { describe, it, expect } from 'vitest';
import { alliances, alliancesRelations } from './alliances';
import { getTableColumns } from 'drizzle-orm';

describe('alliances schema', () => {
  it('should have all required columns', () => {
    const columns = getTableColumns(alliances);

    expect(columns.id).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.profitSharePercent).toBeDefined();
    expect(columns.dissolutionReason).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.activatedAt).toBeDefined();
    expect(columns.dissolvedAt).toBeDefined();
  });

  it('should have correct column types', () => {
    const columns = getTableColumns(alliances);

    expect(columns.id.dataType).toBe('string');
    expect(columns.name.dataType).toBe('string');
    expect(columns.status.dataType).toBe('string');
    expect(columns.profitSharePercent.dataType).toBe('string');
    expect(columns.dissolutionReason.dataType).toBe('string');
    expect(columns.createdAt.dataType).toBe('date');
    expect(columns.activatedAt.dataType).toBe('date');
    expect(columns.dissolvedAt.dataType).toBe('date');
  });

  it('should have status as notNull with default', () => {
    const columns = getTableColumns(alliances);
    expect(columns.status.notNull).toBe(true);
    expect(columns.status.hasDefault).toBe(true);
  });

  it('should have name as nullable', () => {
    const columns = getTableColumns(alliances);
    expect(columns.name.notNull).toBe(false);
  });

  it('should have profitSharePercent with default', () => {
    const columns = getTableColumns(alliances);
    expect(columns.profitSharePercent.hasDefault).toBe(true);
  });

  it('should have createdAt as notNull with default', () => {
    const columns = getTableColumns(alliances);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
  });

  it('should have timestamp columns as nullable except createdAt', () => {
    const columns = getTableColumns(alliances);
    expect(columns.activatedAt.notNull).toBe(false);
    expect(columns.dissolvedAt.notNull).toBe(false);
  });

  it('should have relations defined', () => {
    expect(alliancesRelations).toBeDefined();
  });
});
