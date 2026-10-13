import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { validateInitData } from '../auth/tma-auth.js';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

function createMockTelegramInitData(
  userData: { id: number; username?: string; first_name?: string },
  botToken: string,
  authDateOffsetSeconds: number = 0
): string {
  const authDate = Math.floor(Date.now() / 1000) + authDateOffsetSeconds;
  const userJson = JSON.stringify(userData);

  const params: Record<string, string> = {
    auth_date: authDate.toString(),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: userJson,
  };

  const keys = Object.keys(params).sort();
  const dataCheckString = keys.map((key) => `${key}=${params[key]}`).join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const urlParams = new URLSearchParams(params);
  urlParams.set('hash', hash);
  return urlParams.toString();
}

describe('Telegram Mini App HMAC-SHA256 Auth & Security', () => {
  const botToken = 'test_bot_token_123456:ABCdefGHIjklMNOpqrsTUVwxyz';
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('validates authentic initData with current timestamp', () => {
    const raw = createMockTelegramInitData(
      { id: 987654321, username: 'telegram_pro', first_name: 'Alex' },
      botToken,
      0
    );

    const res = validateInitData(raw, botToken);
    expect(res.isValid).toBe(true);
    expect(res.user?.id).toBe(987654321);
    expect(res.user?.username).toBe('telegram_pro');
  });

  it('rejects expired initData older than 24 hours (replay attack prevention)', () => {
    // 25 hours ago = -90000 seconds
    const expiredRaw = createMockTelegramInitData(
      { id: 987654321, username: 'replayer' },
      botToken,
      -90000
    );

    const res = validateInitData(expiredRaw, botToken);
    expect(res.isValid).toBe(false);
    expect(res.isExpired).toBe(true);
  });

  it('rejects tampered hash', () => {
    const raw = createMockTelegramInitData(
      { id: 987654321, username: 'tamperer' },
      botToken,
      0
    );
    const tampered = raw.replace(/hash=[a-f0-9]{10}/, 'hash=0000000000');

    const res = validateInitData(tampered, botToken);
    expect(res.isValid).toBe(false);
  });

  it('rejects missing hash or missing auth_date', () => {
    expect(validateInitData('user=%7B%22id%22%3A1%7D', botToken).isValid).toBe(false);
    expect(validateInitData('hash=abcdef&user=%7B%22id%22%3A1%7D', botToken).isValid).toBe(false);
  });

  it('Fastify rejects requests with expired initData with 401 Unauthorized', async () => {
    const expiredRaw = createMockTelegramInitData(
      { id: 55555555, username: 'expired_user' },
      botToken,
      -95000
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: {
        Authorization: `tma ${expiredRaw}`,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('expired');
  });

  it('Fastify rejects requests with invalid initData with 401 Unauthorized', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: {
        Authorization: 'tma query_id=invalid&hash=1234567890abcdef1234567890abcdef',
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('Invalid Telegram WebApp initData');
  });

  it('Fastify accepts valid Telegram initData and creates the specific Telegram user', async () => {
    const validRaw = createMockTelegramInitData(
      { id: 777123456, username: 'real_telegram_user', first_name: 'Dmitry' },
      botToken,
      0
    );

    const res = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: {
        Authorization: `tma ${validRaw}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.telegram_id).toBe(777123456);
    expect(body.user.username).toBe('real_telegram_user');
    expect(body.user.balance_ud).toBe(5000);
  });
});
