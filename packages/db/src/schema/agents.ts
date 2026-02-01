import { pgTable, uuid, varchar, decimal, timestamp, text, jsonb, integer, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  role: varchar('role', { length: 30 }).notNull(),
  apiKeyHash: varchar('api_key_hash', { length: 255 }).notNull(),
  callbackUrl: text('callback_url'),
  webhookSecret: varchar('webhook_secret', { length: 64 }),

  // Financials
  cash: decimal('cash', { precision: 20, scale: 2 }).notNull().default('0'),
  marginUsed: decimal('margin_used', { precision: 20, scale: 2 }).notNull().default('0'),
  marginLimit: decimal('margin_limit', { precision: 20, scale: 2 }).notNull().default('0'),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('active'),
  reputation: integer('reputation').notNull().default(50),

  // Webhook tracking
  webhookFailures: integer('webhook_failures').notNull().default(0),
  lastWebhookError: text('last_webhook_error'),
  lastWebhookSuccessAt: timestamp('last_webhook_success_at'),

  // Response time tracking (in milliseconds)
  lastResponseTimeMs: integer('last_response_time_ms'),
  avgResponseTimeMs: integer('avg_response_time_ms'),
  webhookSuccessCount: integer('webhook_success_count').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at'),

  // Metadata
  metadata: jsonb('metadata').default({}),
}, (table) => ({
  nameIdx: index('agents_name_idx').on(table.name),
  statusIdx: index('agents_status_idx').on(table.status),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  holdings: many(holdings),
  orders: many(orders),
  buyTrades: many(trades, { relationName: 'buyTrades' }),
  sellTrades: many(trades, { relationName: 'sellTrades' }),
  actions: many(actions),
  investigations: many(investigations),
}));

// Forward declarations for relations (will be imported from other files)
import { holdings } from './holdings';
import { orders } from './orders';
import { trades } from './trades';
import { actions } from './actions';
import { investigations } from './investigations';
