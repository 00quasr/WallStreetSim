import { pgTable, uuid, varchar, bigint, timestamp, text, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { agents } from './agents';

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tick: bigint('tick', { mode: 'number' }).notNull(),

  // Sender and recipient
  senderId: uuid('sender_id').notNull().references(() => agents.id),
  recipientId: uuid('recipient_id').references(() => agents.id),

  // Message content
  channel: varchar('channel', { length: 30 }).notNull().default('direct'),
  subject: varchar('subject', { length: 100 }),
  content: text('content').notNull(),

  // Status
  isRead: boolean('is_read').notNull().default(false),
  isDeleted: boolean('is_deleted').notNull().default(false),

  // Timestamps
  createdAt: timestamp('created_at').notNull().defaultNow(),
  readAt: timestamp('read_at'),
}, (table) => ({
  tickIdx: index('messages_tick_idx').on(table.tick),
  senderIdx: index('messages_sender_idx').on(table.senderId),
  recipientIdx: index('messages_recipient_idx').on(table.recipientId),
  channelIdx: index('messages_channel_idx').on(table.channel),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(agents, {
    fields: [messages.senderId],
    references: [agents.id],
    relationName: 'sentMessages',
  }),
  recipient: one(agents, {
    fields: [messages.recipientId],
    references: [agents.id],
    relationName: 'receivedMessages',
  }),
}));
