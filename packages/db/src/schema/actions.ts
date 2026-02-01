import { pgTable, uuid, varchar, bigint, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';

export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tick: bigint('tick', { mode: 'number' }).notNull(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),

  // Action details
  actionType: varchar('action_type', { length: 30 }).notNull(),
  targetAgentId: uuid('target_agent_id').references(() => agents.id),
  targetSymbol: varchar('target_symbol', { length: 10 }),

  // Payload and result
  payload: jsonb('payload').notNull(),
  result: jsonb('result'),
  success: boolean('success'),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tickIdx: index('actions_tick_idx').on(table.tick),
  agentIdx: index('actions_agent_idx').on(table.agentId),
  typeIdx: index('actions_type_idx').on(table.actionType),
}));

export const actionsRelations = relations(actions, ({ one }) => ({
  agent: one(agents, {
    fields: [actions.agentId],
    references: [agents.id],
  }),
  targetAgent: one(agents, {
    fields: [actions.targetAgentId],
    references: [agents.id],
  }),
}));
