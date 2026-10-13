import { pgTable, uuid, bigint, varchar, integer, boolean, timestamp, text, jsonb, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 1. Users table
export const users = pgTable('users', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  telegram_id: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: varchar('username', { length: 64 }),
  balance_ud: bigint('balance_ud', { mode: 'number' }).notNull().default(5000),
  level: integer('level').default(1).notNull(),
  xp: integer('xp').default(0).notNull(),
  privacy_hide_balance: boolean('privacy_hide_balance').default(false).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Nickname Catalog
export const nicknameCatalog = pgTable('nickname_catalog', {
  id: serial('id').primaryKey(),
  nickname: varchar('nickname', { length: 32 }).notNull().unique(),
  category: varchar('category', { length: 32 }).notNull(),
  base_memorability: integer('base_memorability').notNull(),
  base_pattern: integer('base_pattern').notNull(),
  default_traits: jsonb('default_traits').$type<string[]>().default([]).notNull(),
});

// 3. Nickname Items
export const nicknameItems = pgTable('nickname_items', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  owner_id: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  nickname: varchar('nickname', { length: 32 }).notNull(),
  rarity: varchar('rarity', { length: 16 }).notNull(), // 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC'
  score: integer('score').notNull(),
  traits: jsonb('traits').$type<string[]>().default([]).notNull(),
  is_favorite: boolean('is_favorite').default(false).notNull(),
  is_locked: boolean('is_locked').default(false).notNull(),
  dropped_at: timestamp('dropped_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Pity State
export const pityState = pgTable('pity_state', {
  user_id: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  counter: integer('counter').notNull().default(0),
  last_updated: timestamp('last_updated', { withTimezone: true }).defaultNow().notNull(),
});

// 5. Avita Deals
export const avitaDeals = pgTable('avita_deals', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  item_id: uuid('item_id').notNull().references(() => nicknameItems.id, { onDelete: 'cascade' }),
  initial_price: integer('initial_price').notNull(),
  action_type: varchar('action_type', { length: 16 }), // 'ACCEPT' | 'PLUS_10' | 'PLUS_125' | 'PLUS_50'
  requested_price: integer('requested_price'),
  final_price: integer('final_price'),
  status: varchar('status', { length: 16 }).notNull(), // 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'
  attempt_count: integer('attempt_count').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
});

// 6. Leaderboard Showcases
export const leaderboardShowcases = pgTable('leaderboard_showcases', {
  user_id: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  item_id: uuid('item_id').notNull().unique().references(() => nicknameItems.id, { onDelete: 'cascade' }),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 7. Wallet Transactions
export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  balance_after: bigint('balance_after', { mode: 'number' }).notNull(),
  reason: varchar('reason', { length: 64 }).notNull(),
  idempotency_key: varchar('idempotency_key', { length: 128 }).unique(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 8. Drop History
export const dropHistory = pgTable('drop_history', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  item_id: uuid('item_id').notNull().references(() => nicknameItems.id, { onDelete: 'cascade' }),
  pity_counter_at_drop: integer('pity_counter_at_drop').notNull(),
  cost_ud: integer('cost_ud').notNull().default(500),
  idempotency_key: varchar('idempotency_key', { length: 128 }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 9. Tasks
export const tasks = pgTable('tasks', {
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 128 }).notNull(),
  reward_ud: integer('reward_ud').notNull(),
  task_type: varchar('task_type', { length: 32 }).notNull(),
  target_count: integer('target_count').default(1).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
});

export const userTasks = pgTable('user_tasks', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  task_id: varchar('task_id', { length: 64 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  progress: integer('progress').default(0).notNull(),
  is_completed: boolean('is_completed').default(false).notNull(),
  claimed_at: timestamp('claimed_at', { withTimezone: true }),
});

// 10. Achievements
export const achievements = pgTable('achievements', {
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 128 }).notNull(),
  description: text('description'),
  reward_ud: integer('reward_ud').notNull(),
  badge_icon: varchar('badge_icon', { length: 64 }).notNull(),
});

export const userAchievements = pgTable('user_achievements', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  achievement_id: varchar('achievement_id', { length: 64 }).notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  unlocked_at: timestamp('unlocked_at', { withTimezone: true }).defaultNow().notNull(),
});
