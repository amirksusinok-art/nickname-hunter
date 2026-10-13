import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';

describe('Concurrency, Transactions, Idempotency & Catalog Integrity', () => {
  let app: FastifyInstance;
  const authHeaders = {
    Authorization: 'tma mock',
  };

  beforeAll(async () => {
    app = await buildApp();
  });

  it('populates nickname_catalog with seeded words and categories', async () => {
    const db = getDb();
    const catalogEntries = await db.select().from(schema.nicknameCatalog);
    expect(catalogEntries.length).toBeGreaterThanOrEqual(50);

    const categories = new Set(catalogEntries.map((e: any) => e.category));
    expect(categories.has('DICTIONARY')).toBe(true);
    expect(categories.has('NUMERIC')).toBe(true);
    expect(categories.has('SHORT')).toBe(true);
    expect(categories.has('SYMMETRIC')).toBe(true);
  });

  it('handles concurrent drop rolls at 500 UD balance without double-spending', async () => {
    // 1. Drain balance down to exactly 500 UD
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    const balance = meRes.json().user.balance_ud;
    const rollsToDrain = Math.floor(balance / 500) - 1;

    for (let i = 0; i < rollsToDrain; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/drop/roll',
        headers: authHeaders,
      });
    }

    // Verify balance is exactly 500
    const verifiedMe = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    expect(verifiedMe.json().user.balance_ud).toBe(500);

    // 2. Fire 2 simultaneous drop rolls
    const [roll1, roll2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/drop/roll',
        headers: authHeaders,
      }),
      app.inject({
        method: 'POST',
        url: '/api/drop/roll',
        headers: authHeaders,
      }),
    ]);

    const statuses = [roll1.statusCode, roll2.statusCode];
    expect(statuses).toContain(200);
    expect(statuses).toContain(400);

    const failedRoll = roll1.statusCode === 400 ? roll1.json() : roll2.json();
    expect(failedRoll.error).toContain('Недостаточно средств');
    expect(failedRoll.missing).toBe(500);

    // Balance must be exactly 0, not negative
    const finalMe = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    expect(finalMe.json().user.balance_ud).toBe(0);
  });

  it('handles concurrent requests with the SAME Idempotency-Key safely', async () => {
    // Credit user with 2000 UD via direct db transaction or dismantle/deal
    const db = getDb();
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    const userId = meRes.json().user.id;

    await db
      .update(schema.users)
      .set({ balance_ud: 2000 })
      .where(eq(schema.users.id, userId));

    const testKey = `concurrent_key_${Date.now()}`;

    // Two simultaneous requests with identical idempotency key
    const [resA, resB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/drop/roll',
        headers: {
          ...authHeaders,
          'Idempotency-Key': testKey,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/drop/roll',
        headers: {
          ...authHeaders,
          'Idempotency-Key': testKey,
        },
      }),
    ]);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);

    const bodyA = resA.json();
    const bodyB = resB.json();

    // Both must return the identical item
    expect(bodyA.item.id).toBe(bodyB.item.id);
    expect(bodyA.item.nickname).toBe(bodyB.item.nickname);

    // Balance must have been deducted only ONCE (2000 - 500 = 1500)
    const afterMe = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    expect(afterMe.json().user.balance_ud).toBe(1500);
  });

  it('returns faithful item and pity state when replaying idempotency key after other drops', async () => {
    const key1 = `sequence_key_1_${Date.now()}`;
    const key2 = `sequence_key_2_${Date.now()}`;

    // Drop 1
    const drop1 = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: { ...authHeaders, 'Idempotency-Key': key1 },
    });
    expect(drop1.statusCode).toBe(200);
    const drop1Item = drop1.json().item;
    const drop1Pity = drop1.json().newPityCounter;

    // Drop 2 (with different key)
    const drop2 = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: { ...authHeaders, 'Idempotency-Key': key2 },
    });
    expect(drop2.statusCode).toBe(200);

    // Replay Drop 1 with key1
    const replay1 = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: { ...authHeaders, 'Idempotency-Key': key1 },
    });
    expect(replay1.statusCode).toBe(200);
    const replayBody = replay1.json();

    expect(replayBody.isIdempotentReplay).toBe(true);
    // Must return the item from Drop 1, NOT Drop 2
    expect(replayBody.item.id).toBe(drop1Item.id);
    expect(replayBody.item.nickname).toBe(drop1Item.nickname);
    // Pity counter must match drop 1 resulting pity counter
    expect(replayBody.newPityCounter).toBe(drop1Pity);
  });

  it('prevents double-selling in concurrent Avita accept calls', async () => {
    const db = getDb();
    const meRes0 = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    await db
      .update(schema.users)
      .set({ balance_ud: 2000 })
      .where(eq(schema.users.id, meRes0.json().user.id));

    // 1. Drop a new item
    const dropRes = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: authHeaders,
    });
    expect(dropRes.statusCode).toBe(200);
    const item = dropRes.json().item;

    // 2. Create quote
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/api/avita/quote',
      headers: authHeaders,
      payload: { itemId: item.id },
    });
    const dealId = quoteRes.json().deal.id;
    const initialPrice = quoteRes.json().deal.initial_price;

    const meBefore = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    const balanceBefore = meBefore.json().user.balance_ud;

    // 3. Fire 2 simultaneous accept requests
    const [acc1, acc2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/avita/accept-offer',
        headers: authHeaders,
        payload: { dealId },
      }),
      app.inject({
        method: 'POST',
        url: '/api/avita/accept-offer',
        headers: authHeaders,
        payload: { dealId },
      }),
    ]);

    const statuses = [acc1.statusCode, acc2.statusCode];
    expect(statuses).toContain(200);
    expect([400, 404]).toContain(acc1.statusCode === 200 ? acc2.statusCode : acc1.statusCode);

    // Balance should only increase by initialPrice ONCE
    const meAfter = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    expect(meAfter.json().user.balance_ud).toBe(balanceBefore + initialPrice);
  });

  it('preserves compromise price when accepting after a counter-offer', async () => {
    const db = getDb();
    const meRes0 = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    await db
      .update(schema.users)
      .set({ balance_ud: 2000 })
      .where(eq(schema.users.id, meRes0.json().user.id));

    // Drop item
    const dropRes = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: authHeaders,
    });
    expect(dropRes.statusCode).toBe(200);
    const item = dropRes.json().item;

    // Quote
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/api/avita/quote',
      headers: authHeaders,
      payload: { itemId: item.id },
    });
    const dealId = quoteRes.json().deal.id;

    // Directly set final_price to simulate Avita counter-offer in DB
    const compromisePrice = quoteRes.json().deal.initial_price + 500;
    await db
      .update(schema.avitaDeals)
      .set({
        action_type: 'PLUS_50',
        final_price: compromisePrice,
      })
      .where(eq(schema.avitaDeals.id, dealId));

    // Accept deal via /negotiate with action: 'ACCEPT'
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'ACCEPT' },
    });

    expect(acceptRes.statusCode).toBe(200);
    const body = acceptRes.json();
    expect(body.status).toBe('ACCEPTED');
    // Must be paid the compromise price!
    expect(body.finalPrice).toBe(compromisePrice);
  });
});
