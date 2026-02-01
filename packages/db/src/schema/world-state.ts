import { pgTable, integer, bigint, boolean, decimal, varchar, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const worldState = pgTable('world_state', {
  id: integer('id').primaryKey().default(1),
  currentTick: bigint('current_tick', { mode: 'number' }).notNull().default(0),

  // Market status
  marketOpen: boolean('market_open').notNull().default(true),

  // Economic indicators
  interestRate: decimal('interest_rate', { precision: 5, scale: 4 }).notNull().default('0.05'),
  inflationRate: decimal('inflation_rate', { precision: 5, scale: 4 }).notNull().default('0.02'),
  gdpGrowth: decimal('gdp_growth', { precision: 5, scale: 4 }).notNull().default('0.03'),

  // Market regime
  regime: varchar('regime', { length: 20 }).notNull().default('normal'), // bull, bear, crash, bubble, normal

  // Last update
  lastTickAt: timestamp('last_tick_at'),
}, (table) => ({
  singleRowCheck: check('single_row_check', sql`${table.id} = 1`),
}));
