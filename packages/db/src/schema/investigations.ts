import { pgTable, uuid, varchar, bigint, decimal, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';

export const investigations = pgTable('investigations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),

  // Investigation details
  crimeType: varchar('crime_type', { length: 50 }).notNull(),
  evidence: jsonb('evidence').default([]),
  status: varchar('status', { length: 20 }).notNull().default('open'), // open, charged, trial, convicted, acquitted, settled

  // Tick tracking
  tickOpened: bigint('tick_opened', { mode: 'number' }).notNull(),
  tickCharged: bigint('tick_charged', { mode: 'number' }),
  tickResolved: bigint('tick_resolved', { mode: 'number' }),

  // Sentencing
  sentenceYears: integer('sentence_years'),
  fineAmount: decimal('fine_amount', { precision: 20, scale: 2 }),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('investigations_agent_idx').on(table.agentId),
  statusIdx: index('investigations_status_idx').on(table.status),
}));

export const investigationsRelations = relations(investigations, ({ one }) => ({
  agent: one(agents, {
    fields: [investigations.agentId],
    references: [agents.id],
  }),
}));
