import { describe, it, expect } from 'vitest';
import { agents, agentsRelations } from './agents';
import { getTableColumns } from 'drizzle-orm';

describe('agents schema', () => {
  it('should have all required columns', () => {
    const columns = getTableColumns(agents);

    expect(columns.id).toBeDefined();
    expect(columns.name).toBeDefined();
    expect(columns.role).toBeDefined();
    expect(columns.apiKeyHash).toBeDefined();
    expect(columns.callbackUrl).toBeDefined();
    expect(columns.webhookSecret).toBeDefined();
    expect(columns.allianceId).toBeDefined();
    expect(columns.cash).toBeDefined();
    expect(columns.marginUsed).toBeDefined();
    expect(columns.marginLimit).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.reputation).toBeDefined();
    expect(columns.webhookFailures).toBeDefined();
    expect(columns.lastWebhookError).toBeDefined();
    expect(columns.lastWebhookSuccessAt).toBeDefined();
    expect(columns.lastResponseTimeMs).toBeDefined();
    expect(columns.avgResponseTimeMs).toBeDefined();
    expect(columns.webhookSuccessCount).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.lastActiveAt).toBeDefined();
    expect(columns.metadata).toBeDefined();
  });

  it('should have allianceId as nullable uuid', () => {
    const columns = getTableColumns(agents);
    expect(columns.allianceId.dataType).toBe('string');
    expect(columns.allianceId.notNull).toBe(false);
  });

  it('should have correct column types', () => {
    const columns = getTableColumns(agents);

    expect(columns.id.dataType).toBe('string');
    expect(columns.name.dataType).toBe('string');
    expect(columns.role.dataType).toBe('string');
    expect(columns.cash.dataType).toBe('string');
    expect(columns.status.dataType).toBe('string');
    expect(columns.reputation.dataType).toBe('number');
    expect(columns.createdAt.dataType).toBe('date');
  });

  it('should have name as notNull and unique', () => {
    const columns = getTableColumns(agents);
    expect(columns.name.notNull).toBe(true);
    expect(columns.name.isUnique).toBe(true);
  });

  it('should have required fields as notNull', () => {
    const columns = getTableColumns(agents);
    expect(columns.role.notNull).toBe(true);
    expect(columns.apiKeyHash.notNull).toBe(true);
    expect(columns.cash.notNull).toBe(true);
    expect(columns.marginUsed.notNull).toBe(true);
    expect(columns.marginLimit.notNull).toBe(true);
    expect(columns.status.notNull).toBe(true);
    expect(columns.reputation.notNull).toBe(true);
  });

  it('should have default values for financial fields', () => {
    const columns = getTableColumns(agents);
    expect(columns.cash.hasDefault).toBe(true);
    expect(columns.marginUsed.hasDefault).toBe(true);
    expect(columns.marginLimit.hasDefault).toBe(true);
  });

  it('should have default values for status fields', () => {
    const columns = getTableColumns(agents);
    expect(columns.status.hasDefault).toBe(true);
    expect(columns.reputation.hasDefault).toBe(true);
    expect(columns.webhookFailures.hasDefault).toBe(true);
    expect(columns.webhookSuccessCount.hasDefault).toBe(true);
  });

  it('should have relations defined', () => {
    expect(agentsRelations).toBeDefined();
  });
});
