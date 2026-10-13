import { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authenticateTMA } from '../auth/tma-auth.js';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateTMA);

  // Get current user profile
  fastify.get('/me', async (request, reply) => {
    const user = request.user!;
    const db = getDb();

    // Fetch pity state
    const pity = await db
      .select()
      .from(schema.pityState)
      .where(eq(schema.pityState.user_id, user.id))
      .limit(1);

    const pityCounter = pity[0]?.counter ?? 0;

    // Fetch drop stats
    const totalDropsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.dropHistory)
      .where(eq(schema.dropHistory.user_id, user.id));

    const totalDrops = Number(totalDropsResult[0]?.count || 0);

    // Fetch highest score / rarest item
    const topItem = await db
      .select()
      .from(schema.nicknameItems)
      .where(eq(schema.nicknameItems.owner_id, user.id))
      .orderBy(desc(schema.nicknameItems.score))
      .limit(1);

    // Current fresh balance from DB
    const freshUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1);

    const currentBalance = freshUser[0] ? Number(freshUser[0].balance_ud) : user.balance_ud;

    return reply.send({
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        balance_ud: currentBalance,
        level: freshUser[0]?.level ?? user.level,
        xp: freshUser[0]?.xp ?? user.xp,
        privacy_hide_balance: freshUser[0]?.privacy_hide_balance ?? user.privacy_hide_balance,
      },
      stats: {
        pity_counter: pityCounter,
        total_drops: totalDrops,
        best_score: topItem[0]?.score || 0,
        best_nickname: topItem[0]?.nickname || null,
        best_rarity: topItem[0]?.rarity || null,
      },
    });
  });

  // Update settings
  fastify.patch('/settings', async (request, reply) => {
    const user = request.user!;
    const body = request.body as { privacy_hide_balance?: boolean };
    const db = getDb();

    if (typeof body.privacy_hide_balance === 'boolean') {
      await db
        .update(schema.users)
        .set({
          privacy_hide_balance: body.privacy_hide_balance,
          updated_at: new Date(),
        })
        .where(eq(schema.users.id, user.id));
    }

    return reply.send({ success: true, privacy_hide_balance: body.privacy_hide_balance });
  });
}
