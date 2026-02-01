import { describe, it, expect } from 'vitest';
import { messages, messagesRelations } from './messages';
import { getTableColumns } from 'drizzle-orm';

describe('messages schema', () => {
  it('should have all required columns', () => {
    const columns = getTableColumns(messages);

    expect(columns.id).toBeDefined();
    expect(columns.tick).toBeDefined();
    expect(columns.senderId).toBeDefined();
    expect(columns.recipientId).toBeDefined();
    expect(columns.channel).toBeDefined();
    expect(columns.subject).toBeDefined();
    expect(columns.content).toBeDefined();
    expect(columns.isRead).toBeDefined();
    expect(columns.isDeleted).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.readAt).toBeDefined();
  });

  it('should have correct column types', () => {
    const columns = getTableColumns(messages);

    // dataType reflects JS type, not SQL type
    expect(columns.id.dataType).toBe('string');
    expect(columns.tick.dataType).toBe('number');
    expect(columns.senderId.dataType).toBe('string');
    expect(columns.recipientId.dataType).toBe('string');
    expect(columns.channel.dataType).toBe('string');
    expect(columns.subject.dataType).toBe('string');
    expect(columns.content.dataType).toBe('string');
    expect(columns.isRead.dataType).toBe('boolean');
    expect(columns.isDeleted.dataType).toBe('boolean');
    expect(columns.createdAt.dataType).toBe('date');
    expect(columns.readAt.dataType).toBe('date');
  });

  it('should have senderId as notNull', () => {
    const columns = getTableColumns(messages);
    expect(columns.senderId.notNull).toBe(true);
  });

  it('should have recipientId as nullable for broadcast messages', () => {
    const columns = getTableColumns(messages);
    expect(columns.recipientId.notNull).toBe(false);
  });

  it('should have content as notNull', () => {
    const columns = getTableColumns(messages);
    expect(columns.content.notNull).toBe(true);
  });

  it('should have tick as notNull', () => {
    const columns = getTableColumns(messages);
    expect(columns.tick.notNull).toBe(true);
  });

  it('should have default values for boolean fields', () => {
    const columns = getTableColumns(messages);
    expect(columns.isRead.hasDefault).toBe(true);
    expect(columns.isDeleted.hasDefault).toBe(true);
  });

  it('should have default value for channel', () => {
    const columns = getTableColumns(messages);
    expect(columns.channel.hasDefault).toBe(true);
  });

  it('should have relations defined', () => {
    expect(messagesRelations).toBeDefined();
  });
});
