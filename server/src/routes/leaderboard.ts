import { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { authenticateTMA } from '../auth/tma-auth.js';

const RARITY_WEIGHT: Record<string, number> = {
  MYTHIC: 6,
  LEGENDARY: 5,
  EPIC: 4,
  RARE: 3,
  UNCOMMON: 2,
  COMMON: 1,
};

export async function leaderboardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateTMA);

  fastify.get('/', async (request, reply) => {
    const user = request.user!;
    const db = getDb();

    // Fetch all showcased entries
    const entries = await db
      .select({
        userId: schema.users.id,
        username: schema.users.username,
        level: schema.users.level,
        balanceUd: schema.users.balance_ud,
        privacyHideBalance: schema.users.privacy_hide_balance,
        itemId: schema.nicknameItems.id,
        nickname: schema.nicknameItems.nickname,
        rarity: schema.nicknameItems.rarity,
        score: schema.nicknameItems.score,
        traits: schema.nicknameItems.traits,
        droppedAt: schema.nicknameItems.dropped_at,
        updatedAt: schema.leaderboardShowcases.updated_at,
      })
      .from(schema.leaderboardShowcases)
      .innerJoin(schema.users, eq(schema.leaderboardShowcases.user_id, schema.users.id))
      .innerJoin(schema.nicknameItems, eq(schema.leaderboardShowcases.item_id, schema.nicknameItems.id));

    // Sort according to deterministic tie-breaker:
    // 1. Score (DESC)
    // 2. Rarity Tier (DESC)
    // 3. droppedAt (ASC)
    // 4. Item ID (ASC)
    entries.sort((a: any, b: any) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const rarityWeightA = RARITY_WEIGHT[a.rarity.toUpperCase()] || 0;
      const rarityWeightB = RARITY_WEIGHT[b.rarity.toUpperCase()] || 0;
      if (rarityWeightB !== rarityWeightA) {
        return rarityWeightB - rarityWeightA;
      }

      const timeA = new Date(a.droppedAt).getTime();
      const timeB = new Date(b.droppedAt).getTime();
      if (timeA !== timeB) {
        return timeA - timeB;
      }

      return a.itemId.localeCompare(b.itemId);
    });

    // Map ranks & privacy mask
    let userRank: number | null = null;
    const mapped = entries.map((entry: any, index: number) => {
      const rank = index + 1;
      const isMe = entry.userId === user.id;
      if (isMe) userRank = rank;

      return {
        rank,
        isMe,
        userId: entry.userId,
        username: entry.username || `Аноним #${entry.userId.slice(0, 4)}`,
        level: entry.level,
        balance: entry.privacyHideBalance ? '••••••' : Number(entry.balanceUd),
        isBalanceHidden: entry.privacyHideBalance,
        item: {
          id: entry.itemId,
          nickname: entry.nickname,
          rarity: entry.rarity,
          score: entry.score,
          traits: entry.traits,
          droppedAt: entry.droppedAt,
        },
      };
    });

    return reply.send({
      leaderboard: mapped.slice(0, 50),
      totalParticipants: mapped.length,
      userRank,
    });
  });
}
