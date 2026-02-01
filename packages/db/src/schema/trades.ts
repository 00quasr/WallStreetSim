import { pgTable, uuid, varchar, bigint, decimal, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';
import { orders } from './orders';

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  tick: bigint('tick', { mode: 'number' }).notNull(),
  symbol: varchar('symbol', { length: 10 }).notNull(),

  // Participants
  buyerId: uuid('buyer_id').references(() => agents.id),
  sellerId: uuid('seller_id').references(() => agents.id),
  buyerOrderId: uuid('buyer_order_id').references(() => orders.id),
  sellerOrderId: uuid('seller_order_id').references(() => orders.id),

  // Trade details
  quantity: bigint('quantity', { mode: 'number' }).notNull(),
  price: decimal('price', { precision: 20, scale: 4 }).notNull(),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  tickIdx: index('trades_tick_idx').on(table.tick),
  symbolIdx: index('trades_symbol_idx').on(table.symbol),
  buyerIdx: index('trades_buyer_idx').on(table.buyerId),
  sellerIdx: index('trades_seller_idx').on(table.sellerId),
}));

export const tradesRelations = relations(trades, ({ one }) => ({
  buyer: one(agents, {
    fields: [trades.buyerId],
    references: [agents.id],
    relationName: 'buyTrades',
  }),
  seller: one(agents, {
    fields: [trades.sellerId],
    references: [agents.id],
    relationName: 'sellTrades',
  }),
  buyerOrder: one(orders, {
    fields: [trades.buyerOrderId],
    references: [orders.id],
    relationName: 'buyerOrder',
  }),
  sellerOrder: one(orders, {
    fields: [trades.sellerOrderId],
    references: [orders.id],
    relationName: 'sellerOrder',
  }),
}));
