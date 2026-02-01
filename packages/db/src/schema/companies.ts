import { pgTable, uuid, varchar, decimal, timestamp, bigint, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: varchar('symbol', { length: 10 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  sector: varchar('sector', { length: 30 }).notNull(),
  industry: varchar('industry', { length: 50 }),

  // Shares
  sharesOutstanding: bigint('shares_outstanding', { mode: 'number' }).notNull(),

  // Fundamentals
  revenue: decimal('revenue', { precision: 20, scale: 2 }).default('0'),
  profit: decimal('profit', { precision: 20, scale: 2 }).default('0'),
  cash: decimal('cash', { precision: 20, scale: 2 }).default('0'),
  debt: decimal('debt', { precision: 20, scale: 2 }).default('0'),

  // Market data
  currentPrice: decimal('current_price', { precision: 20, scale: 4 }),
  previousClose: decimal('previous_close', { precision: 20, scale: 4 }),
  openPrice: decimal('open_price', { precision: 20, scale: 4 }),
  highPrice: decimal('high_price', { precision: 20, scale: 4 }),
  lowPrice: decimal('low_price', { precision: 20, scale: 4 }),
  marketCap: decimal('market_cap', { precision: 20, scale: 2 }),
  volatility: decimal('volatility', { precision: 8, scale: 6 }).default('0.02'),
  beta: decimal('beta', { precision: 5, scale: 4 }).default('1.0'),

  // Agent-driven metrics
  sentiment: decimal('sentiment', { precision: 5, scale: 4 }).default('0'),
  manipulationScore: decimal('manipulation_score', { precision: 8, scale: 6 }).default('0'),

  // Ownership
  ceoAgentId: uuid('ceo_agent_id').references(() => agents.id),
  isPublic: boolean('is_public').notNull().default(true),
  ipoTick: bigint('ipo_tick', { mode: 'number' }),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  symbolIdx: index('companies_symbol_idx').on(table.symbol),
  sectorIdx: index('companies_sector_idx').on(table.sector),
}));

export const companiesRelations = relations(companies, ({ one, many }) => ({
  ceo: one(agents, {
    fields: [companies.ceoAgentId],
    references: [agents.id],
  }),
  holdings: many(holdings),
}));

import { holdings } from './holdings';
