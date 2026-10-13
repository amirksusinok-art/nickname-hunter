import { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateTMA } from '../auth/tma-auth.js';
import {
  calculateInitialPrice,
  evaluateBargain,
  BargainAction,
  calculateDelta,
} from '../game/avita-engine.js';

export async function avitaRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateTMA);

  // Get active pending deal if any
  fastify.get('/active-deal', async (request, reply) => {
    const user = request.user!;
    const db = getDb();

    const activeDeals = await db
      .select({
        deal: schema.avitaDeals,
        item: schema.nicknameItems,
      })
      .from(schema.avitaDeals)
      .innerJoin(schema.nicknameItems, eq(schema.avitaDeals.item_id, schema.nicknameItems.id))
      .where(
        and(
          eq(schema.avitaDeals.user_id, user.id),
          eq(schema.avitaDeals.status, 'PENDING')
        )
      )
      .orderBy(desc(schema.avitaDeals.created_at))
      .limit(1);

    if (!activeDeals[0]) {
      return reply.send({ activeDeal: null });
    }

    const { deal, item } = activeDeals[0];
    return reply.send({
      activeDeal: {
        ...deal,
        item,
        canBargain: deal.action_type === null,
      },
    });
  });

  // Create a new appraisal quote / deal
  fastify.post('/quote', async (request, reply) => {
    const user = request.user!;
    const { itemId } = request.body as { itemId: string };
    const db = getDb();

    if (!itemId) {
      return reply.status(400).send({ error: 'itemId обязателен' });
    }

    // Verify ownership
    const items = await db
      .select()
      .from(schema.nicknameItems)
      .where(and(eq(schema.nicknameItems.id, itemId), eq(schema.nicknameItems.owner_id, user.id)))
      .limit(1);

    const item = items[0];
    if (!item) {
      return reply.status(404).send({ error: 'Предмет не найден в коллекции' });
    }

    // Protection checks
    if (item.is_favorite) {
      return reply.status(400).send({
        error: 'Нельзя продать предмет, находящийся в избранном',
      });
    }

    const showcase = await db
      .select()
      .from(schema.leaderboardShowcases)
      .where(eq(schema.leaderboardShowcases.user_id, user.id))
      .limit(1);

    if (showcase[0]?.item_id === item.id) {
      return reply.status(400).send({
        error: 'Нельзя продать предмет, выставленный на витрину лидерборда',
      });
    }

    // Cancel any previous pending deal for this user
    await db
      .update(schema.avitaDeals)
      .set({ status: 'CANCELLED', closed_at: new Date() })
      .where(
        and(
          eq(schema.avitaDeals.user_id, user.id),
          eq(schema.avitaDeals.status, 'PENDING')
        )
      );

    // Calculate initial price P
    const traitsCount = Array.isArray(item.traits) ? item.traits.length : 0;
    const initialPrice = calculateInitialPrice(item.rarity, item.score, traitsCount);

    // Create deal
    const [deal] = await db
      .insert(schema.avitaDeals)
      .values({
        user_id: user.id,
        item_id: item.id,
        initial_price: initialPrice,
        status: 'PENDING',
      })
      .returning();

    return reply.send({
      deal: {
        ...deal,
        item,
        canBargain: true,
        options: [
          { action: 'ACCEPT', label: `Продать за ${initialPrice} UD`, delta: 0 },
          { action: 'PLUS_10', label: `Торговаться (+10%)`, delta: calculateDelta(initialPrice, 'PLUS_10') },
          { action: 'PLUS_125', label: `Торговаться (+125 UD)`, delta: 125 },
          { action: 'PLUS_50', label: `Наглеть (+50%)`, delta: calculateDelta(initialPrice, 'PLUS_50') },
        ],
      },
    });
  });

  // Negotiate deal
  fastify.post('/negotiate', async (request, reply) => {
    const user = request.user!;
    const { dealId, action } = request.body as {
      dealId: string;
      action: BargainAction;
    };
    const db = getDb();

    if (!dealId || !action) {
      return reply.status(400).send({ error: 'dealId и action обязательны' });
    }

    return await db.transaction(async (tx: any) => {
      const deals = await tx
        .select({
          deal: schema.avitaDeals,
          item: schema.nicknameItems,
        })
        .from(schema.avitaDeals)
        .innerJoin(schema.nicknameItems, eq(schema.avitaDeals.item_id, schema.nicknameItems.id))
        .where(and(eq(schema.avitaDeals.id, dealId), eq(schema.avitaDeals.user_id, user.id)))
        .for('update');

      const active = deals[0];
      if (!active) {
        return reply.status(404).send({ error: 'Сделка не найдена' });
      }

      const { deal, item } = active;

      if (deal.status !== 'PENDING') {
        return reply.status(400).send({
          error: 'Сделка уже закрыта или отменена',
        });
      }

      // Rule: once bargaining option chosen, cannot bargain again
      if (deal.action_type !== null && action !== 'ACCEPT') {
        return reply.status(400).send({
          error: 'Повторный торг в рамках одной сделки запрещен правилами Авиты',
        });
      }

      // Check item ownership and protection
      const itemRows = await tx
        .select()
        .from(schema.nicknameItems)
        .where(eq(schema.nicknameItems.id, item.id))
        .for('update');

      const currentItem = itemRows[0];
      if (!currentItem || currentItem.owner_id !== user.id) {
        return reply.status(400).send({ error: 'Предмет больше не принадлежит вам' });
      }

      if (currentItem.is_favorite) {
        return reply.status(400).send({ error: 'Нельзя продать предмет, находящийся в избранном' });
      }

      const showcase = await tx
        .select()
        .from(schema.leaderboardShowcases)
        .where(eq(schema.leaderboardShowcases.user_id, user.id));

      if (showcase[0]?.item_id === currentItem.id) {
        return reply.status(400).send({ error: 'Нельзя продать предмет, выставленный на витрину лидерборда' });
      }

      if (action === 'ACCEPT') {
        // Accept price: use compromise price if offered, else initial price
        const finalPrice = deal.final_price || deal.initial_price;

        const userRecords = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, user.id))
          .for('update');

        const currentBalance = Number(userRecords[0].balance_ud);
        const newBalance = currentBalance + finalPrice;

        // Atomic close deal
        await tx
          .update(schema.avitaDeals)
          .set({
            action_type: action,
            requested_price: finalPrice,
            final_price: finalPrice,
            status: 'ACCEPTED',
            closed_at: new Date(),
          })
          .where(eq(schema.avitaDeals.id, deal.id));

        // Disown item
        await tx
          .update(schema.nicknameItems)
          .set({ owner_id: null })
          .where(eq(schema.nicknameItems.id, item.id));

        // Credit balance
        await tx
          .update(schema.users)
          .set({ balance_ud: newBalance, updated_at: new Date() })
          .where(eq(schema.users.id, user.id));

        // Log transaction
        await tx.insert(schema.walletTransactions).values({
          user_id: user.id,
          amount: finalPrice,
          balance_after: newBalance,
          reason: 'AVITA_SALE',
        });

        return reply.send({
          status: 'ACCEPTED',
          finalPrice,
          newBalance,
          message: 'По рукам! Отличная сделка.',
          soldItem: currentItem,
        });
      }

      // Evaluate bargain attempt
      const evaluation = evaluateBargain(deal.initial_price, action);

      if (evaluation.isAccepted) {
        const finalPrice = evaluation.finalPrice;

        const userRecords = await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, user.id))
          .for('update');

        const currentBalance = Number(userRecords[0].balance_ud);
        const newBalance = currentBalance + finalPrice;

        await tx
          .update(schema.avitaDeals)
          .set({
            action_type: action,
            requested_price: evaluation.requestedPrice,
            final_price: finalPrice,
            status: 'ACCEPTED',
            closed_at: new Date(),
          })
          .where(eq(schema.avitaDeals.id, deal.id));

        await tx
          .update(schema.nicknameItems)
          .set({ owner_id: null })
          .where(eq(schema.nicknameItems.id, item.id));

        await tx
          .update(schema.users)
          .set({ balance_ud: newBalance, updated_at: new Date() })
          .where(eq(schema.users.id, user.id));

        await tx.insert(schema.walletTransactions).values({
          user_id: user.id,
          amount: finalPrice,
          balance_after: newBalance,
          reason: 'AVITA_SALE',
        });

        return reply.send({
          status: 'ACCEPTED',
          finalPrice,
          newBalance,
          message: evaluation.message,
          soldItem: currentItem,
        });
      }

      // Bargain rejected or compromise offered
      await tx
        .update(schema.avitaDeals)
        .set({
          action_type: action,
          requested_price: evaluation.requestedPrice,
          final_price: evaluation.finalPrice,
        })
        .where(eq(schema.avitaDeals.id, deal.id));

      return reply.send({
        status: evaluation.isCompromise ? 'COMPROMISE' : 'REJECTED',
        initialPrice: deal.initial_price,
        offeredPrice: evaluation.finalPrice,
        message: evaluation.message,
        canAcceptOffered: true,
        dealId: deal.id,
      });
    });
  });

  // Accept counter-offer / compromise from Avita
  fastify.post('/accept-offer', async (request, reply) => {
    const user = request.user!;
    const { dealId } = request.body as { dealId: string };
    const db = getDb();

    return await db.transaction(async (tx: any) => {
      const deals = await tx
        .select({
          deal: schema.avitaDeals,
          item: schema.nicknameItems,
        })
        .from(schema.avitaDeals)
        .innerJoin(schema.nicknameItems, eq(schema.avitaDeals.item_id, schema.nicknameItems.id))
        .where(and(eq(schema.avitaDeals.id, dealId), eq(schema.avitaDeals.user_id, user.id)))
        .for('update');

      const active = deals[0];
      if (!active || active.deal.status !== 'PENDING') {
        return reply.status(404).send({ error: 'Сделка не найдена или уже закрыта' });
      }

      const { deal, item } = active;
      const finalPrice = deal.final_price || deal.initial_price;

      // Lock and verify item
      const itemRows = await tx
        .select()
        .from(schema.nicknameItems)
        .where(eq(schema.nicknameItems.id, item.id))
        .for('update');

      const currentItem = itemRows[0];
      if (!currentItem || currentItem.owner_id !== user.id) {
        return reply.status(400).send({ error: 'Предмет больше не принадлежит вам' });
      }

      if (currentItem.is_favorite) {
        return reply.status(400).send({ error: 'Нельзя продать предмет, находящийся в избранном' });
      }

      const showcase = await tx
        .select()
        .from(schema.leaderboardShowcases)
        .where(eq(schema.leaderboardShowcases.user_id, user.id));

      if (showcase[0]?.item_id === currentItem.id) {
        return reply.status(400).send({ error: 'Нельзя продать предмет, выставленный на витрину лидерборда' });
      }

      const userRecords = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .for('update');

      const currentBalance = Number(userRecords[0].balance_ud);
      const newBalance = currentBalance + finalPrice;

      // Close deal
      await tx
        .update(schema.avitaDeals)
        .set({
          status: 'ACCEPTED',
          final_price: finalPrice,
          closed_at: new Date(),
        })
        .where(eq(schema.avitaDeals.id, deal.id));

      // Transfer item
      await tx
        .update(schema.nicknameItems)
        .set({ owner_id: null })
        .where(eq(schema.nicknameItems.id, item.id));

      // Credit balance
      await tx
        .update(schema.users)
        .set({ balance_ud: newBalance, updated_at: new Date() })
        .where(eq(schema.users.id, user.id));

      // Log transaction
      await tx.insert(schema.walletTransactions).values({
        user_id: user.id,
        amount: finalPrice,
        balance_after: newBalance,
        reason: 'AVITA_SALE_COMPROMISE',
      });

      return reply.send({
        status: 'ACCEPTED',
        finalPrice,
        newBalance,
        message: 'Договорились! Сделка закрыта.',
        soldItem: currentItem,
      });
    });
  });

  // Cancel deal
  fastify.post('/cancel', async (request, reply) => {
    const user = request.user!;
    const { dealId } = request.body as { dealId: string };
    const db = getDb();

    await db
      .update(schema.avitaDeals)
      .set({ status: 'CANCELLED', closed_at: new Date() })
      .where(and(eq(schema.avitaDeals.id, dealId), eq(schema.avitaDeals.user_id, user.id)));

    return reply.send({ success: true, message: 'Сделка отменена. Никнейм остался у вас.' });
  });
}
