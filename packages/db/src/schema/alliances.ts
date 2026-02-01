import { pgTable, uuid, varchar, timestamp, index, decimal, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const alliances = pgTable('alliances', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }),

  // Lifecycle status: pending, active, dissolved
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  // Profit sharing percentage (0-100)
  profitSharePercent: decimal('profit_share_percent', { precision: 5, scale: 2 }).default('0'),

  // Dissolution reason if dissolved
  dissolutionReason: text('dissolution_reason'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  activatedAt: timestamp('activated_at'),
  dissolvedAt: timestamp('dissolved_at'),
}, (table) => ({
  statusIdx: index('alliances_status_idx').on(table.status),
}));

// Forward declaration - will be imported after agents module is updated
import { agents } from './agents';

export const alliancesRelations = relations(alliances, ({ many }) => ({
  members: many(agents),
}));
