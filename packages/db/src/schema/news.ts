import { pgTable, uuid, varchar, bigint, decimal, timestamp, text, index } from 'drizzle-orm/pg-core';

export const news = pgTable('news', {
  id: uuid('id').primaryKey().defaultRandom(),
  tick: bigint('tick', { mode: 'number' }).notNull(),

  // Content
  headline: text('headline').notNull(),
  content: text('content'),
  category: varchar('category', { length: 30 }),

  // Affected entities (stored as comma-separated for simplicity)
  agentIds: text('agent_ids').default(''),
  symbols: text('symbols').default(''),

  // Sentiment impact (-1 to 1)
  sentiment: decimal('sentiment', { precision: 5, scale: 4 }),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tickIdx: index('news_tick_idx').on(table.tick),
  categoryIdx: index('news_category_idx').on(table.category),
}));
