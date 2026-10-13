import { describe, it, expect, beforeAll } from 'vitest';
import { buildApp } from '../app.js';
import { FastifyInstance } from 'fastify';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  const authHeaders = {
    Authorization: 'tma mock',
  };

  beforeAll(async () => {
    app = await buildApp();
  });

  it('GET /api/health returns 200 OK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /api/user/me returns initial user with 5000 UD', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.telegram_id).toBe(123456789);
    expect(body.user.balance_ud).toBe(5000);
    expect(body.stats.pity_counter).toBe(0);
  });

  it('POST /api/drop/roll performs drop, costs 500 UD, and saves item', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.newBalance).toBe(4500);
    expect(body.item).toBeDefined();
    expect(body.item.nickname).toBeDefined();
    expect(body.item.rarity).toBeDefined();
    expect(body.item.score).toBeGreaterThanOrEqual(100);
    expect(body.scoreBreakdown).toBeDefined();
  });

  it('GET /api/collection returns dropped item', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCount).toBeGreaterThanOrEqual(1);
    expect(body.items[0].nickname).toBeDefined();
  });

  it('POST /api/collection/:id/favorite toggles favorite', async () => {
    const collRes = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: authHeaders,
    });
    const item = collRes.json().items[0];

    const favRes = await app.inject({
      method: 'POST',
      url: `/api/collection/${item.id}/favorite`,
      headers: authHeaders,
    });

    expect(favRes.statusCode).toBe(200);
    expect(favRes.json().is_favorite).toBe(true);

    // Cannot dismantle favorite item
    const disRes = await app.inject({
      method: 'POST',
      url: `/api/collection/${item.id}/dismantle`,
      headers: authHeaders,
    });
    expect(disRes.statusCode).toBe(400);

    // Toggle back off
    await app.inject({
      method: 'POST',
      url: `/api/collection/${item.id}/favorite`,
      headers: authHeaders,
    });
  });

  it('POST /api/collection/:id/showcase sets item in leaderboard', async () => {
    const collRes = await app.inject({
      method: 'GET',
      url: '/api/collection',
      headers: authHeaders,
    });
    const item = collRes.json().items[0];

    const showRes = await app.inject({
      method: 'POST',
      url: `/api/collection/${item.id}/showcase`,
      headers: authHeaders,
    });

    expect(showRes.statusCode).toBe(200);
    expect(showRes.json().showcasedItemId).toBe(item.id);

    // Leaderboard now contains this item
    const leadRes = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
      headers: authHeaders,
    });
    expect(leadRes.statusCode).toBe(200);
    const leadBody = leadRes.json();
    expect(leadBody.leaderboard.length).toBeGreaterThanOrEqual(1);
    expect(leadBody.leaderboard[0].item.id).toBe(item.id);
  });

  it('POST /api/avita/quote and negotiate', async () => {
    // Drop another item to test selling
    const dropRes = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: authHeaders,
    });
    const item = dropRes.json().item;

    const quoteRes = await app.inject({
      method: 'POST',
      url: '/api/avita/quote',
      headers: authHeaders,
      payload: { itemId: item.id },
    });

    expect(quoteRes.statusCode).toBe(200);
    const quoteBody = quoteRes.json();
    expect(quoteBody.deal.initial_price).toBeGreaterThan(0);
    const dealId = quoteBody.deal.id;

    // Negotiate: Accept
    const negRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'ACCEPT' },
    });

    expect(negRes.statusCode).toBe(200);
    const negBody = negRes.json();
    expect(negBody.status).toBe('ACCEPTED');
    expect(negBody.finalPrice).toBe(quoteBody.deal.initial_price);
  });

  it('rejects duplicate bargaining on the same deal', async () => {
    // Drop item
    const dropRes = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: authHeaders,
    });
    const item = dropRes.json().item;

    // Quote
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/api/avita/quote',
      headers: authHeaders,
      payload: { itemId: item.id },
    });
    const dealId = quoteRes.json().deal.id;

    // First bargain request: +10%
    await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'PLUS_10' },
    });

    // Second bargain attempt: should be blocked
    const repeatBargain = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'PLUS_50' },
    });

    expect(repeatBargain.statusCode).toBe(400);
    expect([
      'Сделка уже закрыта или отменена',
      'Повторный торг в рамках одной сделки запрещен правилами Авиты',
    ]).toContain(repeatBargain.json().error);
  });

  it('blocks drop roll when balance < 500 UD and reports missing UD', async () => {
    // Drain balance to < 500 UD
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/user/me',
      headers: authHeaders,
    });
    const balance = meRes.json().user.balance_ud;
    const rollsToDrain = Math.floor(balance / 500);

    for (let i = 0; i < rollsToDrain; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/drop/roll',
        headers: authHeaders,
      });
    }

    // Now balance should be 0
    const failRoll = await app.inject({
      method: 'POST',
      url: '/api/drop/roll',
      headers: authHeaders,
    });

    expect(failRoll.statusCode).toBe(400);
    const body = failRoll.json();
    expect(body.error).toContain('Недостаточно средств');
    expect(body.required).toBe(500);
    expect(body.current).toBeLessThan(500);
    expect(body.missing).toBe(500 - body.current);
  });
});
