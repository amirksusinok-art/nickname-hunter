import crypto from 'node:crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CONFIG } from '../config.js';
import { getDb, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

export interface TelegramUserData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  telegram_id: number;
  username: string | null;
  balance_ud: number;
  level: number;
  xp: number;
  privacy_hide_balance: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function validateInitData(
  initDataRaw: string,
  botToken: string
): { isValid: boolean; user?: TelegramUserData; authDate?: number; isExpired?: boolean } {
  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) return { isValid: false };

    params.delete('hash');

    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const isValidHash = calculatedHash === hash;
    if (!isValidHash) return { isValid: false };

    const authDateStr = params.get('auth_date');
    if (!authDateStr) return { isValid: false };
    const authDate = parseInt(authDateStr, 10);
    if (isNaN(authDate)) return { isValid: false };

    const now = Math.floor(Date.now() / 1000);
    // Allow up to 24 hours (86400 seconds) in the past, and up to 120s clock skew in the future
    if (now - authDate > 86400 || authDate - now > 120) {
      return { isValid: false, authDate, isExpired: true };
    }

    const userStr = params.get('user');
    const user = userStr ? (JSON.parse(userStr) as TelegramUserData) : undefined;

    return { isValid: true, user, authDate };
  } catch {
    return { isValid: false };
  }
}

export async function authenticateTMA(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const db = getDb();

  let telegramId = 123456789;
  let username: string | null = 'hunter_dev';

  if (authHeader && authHeader.startsWith('tma ')) {
    const initData = authHeader.slice(4).trim();

    if (initData === 'mock' || initData === 'dev') {
      if (!CONFIG.DEV_MOCK) {
        return reply.status(401).send({ error: 'Mock authentication not allowed in production' });
      }
      telegramId = 123456789;
      username = 'hunter_dev';
    } else {
      const validation = validateInitData(initData, CONFIG.BOT_TOKEN);
      if (!validation.isValid) {
        return reply.status(401).send({
          error: validation.isExpired
            ? 'Telegram WebApp initData has expired'
            : 'Invalid Telegram WebApp initData',
        });
      }
      if (validation.user) {
        telegramId = validation.user.id;
        username = validation.user.username || validation.user.first_name || `user_${telegramId}`;
      }
    }
  } else {
    // No header provided
    if (CONFIG.DEV_MOCK) {
      telegramId = 123456789;
      username = 'hunter_dev';
    } else {
      return reply.status(401).send({ error: 'Missing Authorization header with tma <initData>' });
    }
  }

  // Find or create user in DB
  const existingUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.telegram_id, telegramId))
    .limit(1);

  let userRecord = existingUsers[0];

  if (!userRecord) {
    const [created] = await db
      .insert(schema.users)
      .values({
        telegram_id: telegramId,
        username: username,
        balance_ud: CONFIG.STARTING_BALANCE_UD,
        level: 1,
        xp: 0,
      })
      .returning();

    userRecord = created;

    // Initialize pity state
    await db.insert(schema.pityState).values({
      user_id: userRecord.id,
      counter: 0,
    });
  }

  request.user = {
    id: userRecord.id,
    telegram_id: userRecord.telegram_id,
    username: userRecord.username,
    balance_ud: Number(userRecord.balance_ud),
    level: userRecord.level,
    xp: userRecord.xp,
    privacy_hide_balance: userRecord.privacy_hide_balance,
  };
}
