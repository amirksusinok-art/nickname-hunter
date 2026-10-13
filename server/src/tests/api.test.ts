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

  it('supports custom price negotiation, triggers outrage on absurd prices, and enforces 3-attempt limit', async () => {
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
    const deal = quoteRes.json().deal;
    const dealId = deal.id;
    const initialPrice = deal.initial_price;

    // Attempt 1: Absurd custom price (> 2.5 * P_base) -> Outrage!
    const outrageRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: {
        dealId,
        action: 'CUSTOM',
        customPrice: Math.round(initialPrice * 3),
      },
    });
    expect(outrageRes.statusCode).toBe(200);
    const outrageBody = outrageRes.json();
    expect(outrageBody.isOutrage).toBe(true);
    expect(outrageBody.status).toBe('OUTRAGE');
    expect(outrageBody.attemptCount).toBe(1);
    expect(outrageBody.canBargain).toBe(true);
    expect(outrageBody.message).toContain('Ты надо мной издеваешься');

    // Attempt 2: Another outrage burns round 2
    const attempt2Res = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: {
        dealId,
        action: 'CUSTOM',
        customPrice: Math.round(initialPrice * 2.8),
      },
    });
    expect(attempt2Res.statusCode).toBe(200);
    expect(attempt2Res.json().attemptCount).toBe(2);
    expect(attempt2Res.json().canBargain).toBe(true);

    // Attempt 3: Outrage burns round 3 -> locks bargaining
    const attempt3Res = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: {
        dealId,
        action: 'CUSTOM',
        customPrice: Math.round(initialPrice * 2.9),
      },
    });
    expect(attempt3Res.statusCode).toBe(200);
    expect(attempt3Res.json().attemptCount).toBe(3);
    expect(attempt3Res.json().canBargain).toBe(false);

    // Attempt 4: Should be blocked by 3-attempt limit!
    const attempt4Res = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: {
        dealId,
        action: 'PLUS_10',
      },
    });
    expect(attempt4Res.statusCode).toBe(400);
    expect(attempt4Res.json().error).toContain('Лимит попыток торга исчерпан');

    // Final accept after limit reached
    const acceptFinalRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'ACCEPT' },
    });
    expect(acceptFinalRes.statusCode).toBe(200);
    expect(acceptFinalRes.json().status).toBe('ACCEPTED');
  });

  it('validates custom price input and guards against invalid/infinite/sub-floor values', async () => {
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
    const deal = quoteRes.json().deal;
    const dealId = deal.id;
    const initialPrice = deal.initial_price;

    // Sub-floor price
    const lowRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'CUSTOM', customPrice: initialPrice },
    });
    expect(lowRes.statusCode).toBe(400);
    expect(lowRes.json().error).toContain('больше текущей');

    // Negative price
    const negPriceRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'CUSTOM', customPrice: -100 },
    });
    expect(negPriceRes.statusCode).toBe(400);

    // Value exceeding limit
    const hugeRes = await app.inject({
      method: 'POST',
      url: '/api/avita/negotiate',
      headers: authHeaders,
      payload: { dealId, action: 'CUSTOM', customPrice: 2_000_000_000 },
    });
    expect(hugeRes.statusCode).toBe(400);

    // Verify GET /active-deal
    const activeRes = await app.inject({
      method: 'GET',
      url: '/api/avita/active-deal',
      headers: authHeaders,
    });
    expect(activeRes.statusCode).toBe(200);
    const activeData = activeRes.json().activeDeal;
    expect(activeData.attemptCount).toBe(0);
    expect(activeData.canBargain).toBe(true);
    expect(activeData.currentPrice).toBe(initialPrice);
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
