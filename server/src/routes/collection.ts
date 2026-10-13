import { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { authenticateTMA } from '../auth/tma-auth.js';
import { BASE_PRICES } from '../game/avita-engine.js';
import { RarityTier } from '../game/nickname-score.js';

export async function collectionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateTMA);

  // Get user's items
  fastify.get('/', async (request, reply) => {
    const user = request.user!;
    const db = getDb();

    const items = await db
      .select()
      .from(schema.nicknameItems)
      .where(eq(schema.nicknameItems.owner_id, user.id))
      .orderBy(desc(schema.nicknameItems.dropped_at));

    // Get current showcase
    const showcase = await db
      .select()
      .from(schema.leaderboardShowcases)
      .where(eq(schema.leaderboardShowcases.user_id, user.id))
      .limit(1);

    const showcaseItemId = showcase[0]?.item_id;

    const enrichedItems = items.map((item: any) => ({
      ...item,
      is_showcased: item.id === showcaseItemId,
    }));

    return reply.send({
      items: enrichedItems,
      showcaseItemId,
      totalCount: items.length,
    });
  });

  // Toggle favorite
  fastify.post('/:id/favorite', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const db = getDb();

    const items = await db
      .select()
      .from(schema.nicknameItems)
      .where(and(eq(schema.nicknameItems.id, id), eq(schema.nicknameItems.owner_id, user.id)))
      .limit(1);

    const item = items[0];
    if (!item) {
      return reply.status(404).send({ error: 'Предмет не найден в коллекции' });
    }

    const newFavoriteState = !item.is_favorite;

    await db
      .update(schema.nicknameItems)
      .set({ is_favorite: newFavoriteState })
      .where(eq(schema.nicknameItems.id, id));

    return reply.send({ success: true, is_favorite: newFavoriteState });
  });

  // Set item as leaderboard showcase
  fastify.post('/:id/showcase', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const db = getDb();

    const items = await db
      .select()
      .from(schema.nicknameItems)
      .where(and(eq(schema.nicknameItems.id, id), eq(schema.nicknameItems.owner_id, user.id)))
      .limit(1);

    const item = items[0];
    if (!item) {
      return reply.status(404).send({ error: 'Предмет не найден в коллекции' });
    }

    // Upsert leaderboard showcase
    await db
      .insert(schema.leaderboardShowcases)
      .values({
        user_id: user.id,
        item_id: item.id,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.leaderboardShowcases.user_id,
        set: {
          item_id: item.id,
          updated_at: new Date(),
        },
      });

    return reply.send({ success: true, showcasedItemId: item.id });
  });

  // Dismantle duplicate / item for UD fragments
  fastify.post('/:id/dismantle', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const db = getDb();

    return await db.transaction(async (tx: any) => {
      const items = await tx
        .select()
        .from(schema.nicknameItems)
        .where(and(eq(schema.nicknameItems.id, id), eq(schema.nicknameItems.owner_id, user.id)))
        .for('update');

      const item = items[0];
      if (!item) {
        return reply.status(404).send({ error: 'Предмет не найден в коллекции' });
      }

      // Check protection: favorite or showcased
      if (item.is_favorite) {
        return reply.status(400).send({
          error: 'Нельзя разобрать предмет, находящийся в избранном',
        });
      }

      const showcase = await tx
        .select()
        .from(schema.leaderboardShowcases)
        .where(eq(schema.leaderboardShowcases.user_id, user.id));

      if (showcase[0]?.item_id === item.id) {
        return reply.status(400).send({
          error: 'Нельзя разобрать предмет, выставленный на витрину лидерборда',
        });
      }

      // Calculate recycle reward (50% of base rarity price)
      const basePrice = BASE_PRICES[(item.rarity.toUpperCase() as RarityTier)] || 100;
      const dismantleReward = Math.round(basePrice * 0.5);

      // Lock user for balance update
      const userRecords = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .for('update');

      const currentBalance = Number(userRecords[0].balance_ud);
      const newBalance = currentBalance + dismantleReward;

      // Disown/delete item
      await tx
        .update(schema.nicknameItems)
        .set({ owner_id: null })
        .where(eq(schema.nicknameItems.id, item.id));

      // Update user balance
      await tx
        .update(schema.users)
        .set({
          balance_ud: newBalance,
          updated_at: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      // Log transaction
      await tx.insert(schema.walletTransactions).values({
        user_id: user.id,
        amount: dismantleReward,
        balance_after: newBalance,
        reason: `DISMANTLE_${item.rarity}`,
      });

      return reply.send({
        success: true,
        dismantleReward,
        newBalance,
        dismantledItem: item,
      });
    });
  });
}
