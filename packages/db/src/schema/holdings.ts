import { pgTable, uuid, varchar, bigint, decimal, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';
import { companies } from './companies';

export const holdings = pgTable('holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  symbol: varchar('symbol', { length: 10 }).notNull(),

  // Position
  quantity: bigint('quantity', { mode: 'number' }).notNull(), // Negative = short position
  averageCost: decimal('average_cost', { precision: 20, scale: 4 }).notNull(),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  agentSymbolUnique: unique('holdings_agent_symbol_unique').on(table.agentId, table.symbol),
  agentIdx: index('holdings_agent_idx').on(table.agentId),
  symbolIdx: index('holdings_symbol_idx').on(table.symbol),
}));

export const holdingsRelations = relations(holdings, ({ one }) => ({
  agent: one(agents, {
    fields: [holdings.agentId],
    references: [agents.id],
  }),
  company: one(companies, {
    fields: [holdings.symbol],
    references: [companies.symbol],
  }),
}));
