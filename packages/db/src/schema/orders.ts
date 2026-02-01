import { pgTable, uuid, varchar, bigint, decimal, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';
import { trades } from './trades';

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  symbol: varchar('symbol', { length: 10 }).notNull(),

  // Order details
  side: varchar('side', { length: 4 }).notNull(), // BUY, SELL
  orderType: varchar('order_type', { length: 10 }).notNull(), // MARKET, LIMIT, STOP
  quantity: bigint('quantity', { mode: 'number' }).notNull(),
  price: decimal('price', { precision: 20, scale: 4 }), // NULL for market orders
  stopPrice: decimal('stop_price', { precision: 20, scale: 4 }),

  // Status
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, filled, partial, cancelled, rejected
  filledQuantity: bigint('filled_quantity', { mode: 'number' }).notNull().default(0),
  avgFillPrice: decimal('avg_fill_price', { precision: 20, scale: 4 }),

  // Tick tracking
  tickSubmitted: bigint('tick_submitted', { mode: 'number' }).notNull(),
  tickFilled: bigint('tick_filled', { mode: 'number' }),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  agentIdx: index('orders_agent_idx').on(table.agentId),
  symbolStatusIdx: index('orders_symbol_status_idx').on(table.symbol, table.status),
  tickIdx: index('orders_tick_idx').on(table.tickSubmitted),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  agent: one(agents, {
    fields: [orders.agentId],
    references: [agents.id],
  }),
  buyTrades: many(trades, { relationName: 'buyerOrder' }),
  sellTrades: many(trades, { relationName: 'sellerOrder' }),
}));
