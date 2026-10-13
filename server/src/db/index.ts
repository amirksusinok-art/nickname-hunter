import { drizzle } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { CONFIG } from '../config.js';
import * as schema from './schema.js';

let dbInstance: any = null;
let clientInstance: any = null;

const DDL_STATEMENTS = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  username VARCHAR(64),
  balance_ud BIGINT NOT NULL DEFAULT 5000 CHECK (balance_ud >= 0),
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  privacy_hide_balance BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nickname_catalog (
  id SERIAL PRIMARY KEY,
  nickname VARCHAR(32) NOT NULL UNIQUE,
  category VARCHAR(32) NOT NULL,
  base_memorability INT NOT NULL,
  base_pattern INT NOT NULL,
  default_traits JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS nickname_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  nickname VARCHAR(32) NOT NULL,
  rarity VARCHAR(16) NOT NULL,
  score INT NOT NULL CHECK (score >= 0 AND score <= 1000),
  traits JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  dropped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pity_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  counter INT NOT NULL DEFAULT 0 CHECK (counter >= 0),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avita_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES nickname_items(id) ON DELETE CASCADE,
  initial_price INT NOT NULL,
  action_type VARCHAR(16),
  requested_price INT,
  final_price INT,
  status VARCHAR(16) NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

ALTER TABLE avita_deals ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS leaderboard_showcases (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL UNIQUE REFERENCES nickname_items(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reason VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drop_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES nickname_items(id) ON DELETE CASCADE,
  pity_counter_at_drop INT NOT NULL,
  cost_ud INT NOT NULL DEFAULT 500,
  idempotency_key VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  reward_ud INT NOT NULL,
  task_type VARCHAR(32) NOT NULL,
  target_count INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress INT NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS achievements (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  description TEXT,
  reward_ud INT NOT NULL,
  badge_icon VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(64) NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_owner ON nickname_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_rarity ON nickname_items(rarity);
CREATE INDEX IF NOT EXISTS idx_items_score ON nickname_items(score DESC);
CREATE INDEX IF NOT EXISTS idx_deals_user_status ON avita_deals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_showcases_updated ON leaderboard_showcases(updated_at);
CREATE INDEX IF NOT EXISTS idx_drop_history_idempotency ON drop_history(idempotency_key);
`;

const INITIAL_CATALOG = [
  { nickname: 'apex', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'echo', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'nova', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'zero', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'blade', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'frost', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'titan', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'ghost', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'pulse', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'nexus', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'vortex', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'oracle', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'shadow', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'matrix', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'falcon', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'sniper', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'zenith', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'phantom', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'cipher', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'quantum', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'astral', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'hydra', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'lynx', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'storm', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'vector', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'solaris', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'chronos', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'aurora', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'valkyrie', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'inferno', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'spectre', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'draco', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'havoc', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'omen', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'blaze', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'rift', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'strike', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'karma', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'clutch', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'glitch', category: 'DICTIONARY', base_memorability: 1000, base_pattern: 150, default_traits: [] },
  { nickname: 'ace', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'neo', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'fox', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'god', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'sky', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'vip', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'pro', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'bot', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'dev', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'fly', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'sun', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'hex', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'zen', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'arc', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'ion', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'orb', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'max', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'kai', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'ray', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'ash', category: 'SHORT', base_memorability: 1000, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: '777', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '888', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '999', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '1337', category: 'NUMERIC', base_memorability: 700, base_pattern: 150, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '2020', category: 'NUMERIC', base_memorability: 700, base_pattern: 600, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '404', category: 'NUMERIC', base_memorability: 700, base_pattern: 850, default_traits: ['Number-God', 'Symmetrical', 'Shorty'] },
  { nickname: '007', category: 'NUMERIC', base_memorability: 700, base_pattern: 150, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '100', category: 'NUMERIC', base_memorability: 700, base_pattern: 150, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '111', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '555', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '333', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '666', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '123', category: 'NUMERIC', base_memorability: 600, base_pattern: 750, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '321', category: 'NUMERIC', base_memorability: 600, base_pattern: 750, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '808', category: 'NUMERIC', base_memorability: 700, base_pattern: 850, default_traits: ['Number-God', 'Symmetrical', 'Shorty'] },
  { nickname: '909', category: 'NUMERIC', base_memorability: 700, base_pattern: 850, default_traits: ['Number-God', 'Symmetrical', 'Shorty'] },
  { nickname: '707', category: 'NUMERIC', base_memorability: 700, base_pattern: 850, default_traits: ['Number-God', 'Symmetrical', 'Shorty'] },
  { nickname: '505', category: 'NUMERIC', base_memorability: 700, base_pattern: 850, default_traits: ['Number-God', 'Symmetrical', 'Shorty'] },
  { nickname: '000', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: '9999', category: 'NUMERIC', base_memorability: 700, base_pattern: 1000, default_traits: ['Number-God', 'Shorty'] },
  { nickname: 'xxx', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'aaa', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'zzz', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'qqq', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'vvv', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'ooo', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'fff', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'yyy', category: 'MONO', base_memorability: 600, base_pattern: 1000, default_traits: ['Shorty'] },
  { nickname: 'xox', category: 'SYMMETRIC', base_memorability: 500, base_pattern: 850, default_traits: ['Symmetrical', 'Shorty'] },
  { nickname: 'aba', category: 'SYMMETRIC', base_memorability: 500, base_pattern: 850, default_traits: ['Symmetrical', 'Shorty'] },
  { nickname: 'radar', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'level', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'stats', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'noon', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical', 'Shorty'] },
  { nickname: 'wow', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical', 'Shorty'] },
  { nickname: 'pop', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical', 'Shorty'] },
  { nickname: 'eye', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical', 'Shorty'] },
  { nickname: 'kayak', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'rotor', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'madam', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'tenet', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'civic', category: 'SYMMETRIC', base_memorability: 1000, base_pattern: 850, default_traits: ['Symmetrical'] },
  { nickname: 'v1p', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'k0d', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'b0ss', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'cr3w', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'h4ck', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: '3l1t3', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: [] },
  { nickname: 'r00t', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'd4rk', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'n30', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
  { nickname: 'f1r3', category: 'LEET', base_memorability: 500, base_pattern: 150, default_traits: ['Shorty'] },
];

export async function seedNicknameCatalog(db: any) {
  for (const entry of INITIAL_CATALOG) {
    await db
      .insert(schema.nicknameCatalog)
      .values(entry)
      .onConflictDoNothing({ target: schema.nicknameCatalog.nickname });
  }
}

export async function initDatabase(dbUrl?: string) {
  if (dbInstance) return { db: dbInstance, client: clientInstance };

  const url = dbUrl || CONFIG.DATABASE_URL;

  if (url && url.startsWith('postgres')) {
    const pool = new pg.Pool({ connectionString: url });
    await pool.query(DDL_STATEMENTS);
    clientInstance = pool;
    dbInstance = drizzlePg(pool, { schema });
  } else {
    // In-memory or file-backed PGlite for local development and testing
    const pglite = new PGlite();
    await pglite.exec(DDL_STATEMENTS);
    clientInstance = pglite;
    dbInstance = drizzle(pglite, { schema });
  }

  // Populate initial nickname catalog
  await seedNicknameCatalog(dbInstance);

  return { db: dbInstance, client: clientInstance };
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export { schema };
