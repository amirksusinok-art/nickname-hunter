import { FastifyInstance } from 'fastify';
import { getDb, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { authenticateTMA } from '../auth/tma-auth.js';
import { CONFIG } from '../config.js';
import { rollRarity } from '../game/pity-system.js';
import { generateNicknameForRarity } from '../game/nickname-generator.js';
import { calculateNicknameScore } from '../game/nickname-score.js';

export async function dropRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateTMA);

  fastify.post('/roll', async (request, reply) => {
    const user = request.user!;
    const db = getDb();
    const idempotencyKey =
      (request.headers['idempotency-key'] as string) ||
      (request.headers['x-idempotency-key'] as string) ||
      null;

    return await db.transaction(async (tx: any) => {
      // 1. Check idempotency if key provided
      if (idempotencyKey) {
        const existingTx = await tx
          .select()
          .from(schema.walletTransactions)
          .where(eq(schema.walletTransactions.idempotency_key, idempotencyKey))
          .limit(1);

        if (existingTx[0]) {
          // Correlate with drop history for this specific idempotency key
          const dropHistoryRecord = await tx
            .select({
              item: schema.nicknameItems,
              pityCounterAtDrop: schema.dropHistory.pity_counter_at_drop,
            })
            .from(schema.dropHistory)
            .innerJoin(schema.nicknameItems, eq(schema.dropHistory.item_id, schema.nicknameItems.id))
            .where(eq(schema.dropHistory.idempotency_key, idempotencyKey))
            .limit(1);

          if (dropHistoryRecord[0]) {
            const replayedItem = dropHistoryRecord[0].item;
            const isEpicPlus = ['EPIC', 'LEGENDARY', 'MYTHIC'].includes(replayedItem.rarity.toUpperCase());
            const replayedNextPity = isEpicPlus ? 0 : dropHistoryRecord[0].pityCounterAtDrop + 1;
            const scoreBreakdown = calculateNicknameScore(
              replayedItem.nickname,
              replayedItem.rarity,
              replayedItem.traits || [],
              false
            );

            return reply.send({
              isIdempotentReplay: true,
              item: replayedItem,
              newBalance: Number(existingTx[0].balance_after),
              newPityCounter: replayedNextPity,
              scoreBreakdown,
            });
          }
        }
      }

      // 2. Fetch fresh user with row-level lock (FOR UPDATE)
      const userRecords = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id))
        .for('update');

      const currentUser = userRecords[0];
      if (!currentUser) {
        return reply.status(404).send({ error: 'Пользователь не найден' });
      }

      const currentBalance = Number(currentUser.balance_ud);
      if (currentBalance < CONFIG.DROP_COST_UD) {
        const missing = CONFIG.DROP_COST_UD - currentBalance;
        return reply.status(400).send({
          error: 'Недостаточно средств для выбивания ника',
          required: CONFIG.DROP_COST_UD,
          current: currentBalance,
          missing: missing,
        });
      }

      // 3. Fetch pity state with row-level lock
      const pityRecords = await tx
        .select()
        .from(schema.pityState)
        .where(eq(schema.pityState.user_id, user.id))
        .for('update');

      const currentPity = pityRecords[0]?.counter ?? 0;

      // 4. Roll drop & calculate score
      const { rarity, nextPityCounter } = rollRarity(currentPity);
      const generated = generateNicknameForRarity(rarity);
      const scoreBreakdown = calculateNicknameScore(
        generated.nickname,
        generated.rarity,
        generated.traits,
        generated.isDictionaryWord
      );

      // Register generated nickname into catalog
      await tx
        .insert(schema.nicknameCatalog)
        .values({
          nickname: generated.nickname,
          category: generated.category,
          base_memorability: scoreBreakdown.M,
          base_pattern: scoreBreakdown.P,
          default_traits: generated.traits,
        })
        .onConflictDoNothing({ target: schema.nicknameCatalog.nickname });

      const newBalance = currentBalance - CONFIG.DROP_COST_UD;
      const newXp = currentUser.xp + 25;
      const xpNeeded = currentUser.level * 100;
      const newLevel = newXp >= xpNeeded ? currentUser.level + 1 : currentUser.level;

      // 5. Persist item atomically
      const [newItem] = await tx
        .insert(schema.nicknameItems)
        .values({
          owner_id: user.id,
          nickname: generated.nickname,
          rarity: generated.rarity,
          score: generated.score,
          traits: generated.traits,
          is_favorite: false,
          is_locked: false,
        })
        .returning();

      // Update user balance and XP
      await tx
        .update(schema.users)
        .set({
          balance_ud: newBalance,
          xp: newXp,
          level: newLevel,
          updated_at: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      // Update pity state
      await tx
        .insert(schema.pityState)
        .values({
          user_id: user.id,
          counter: nextPityCounter,
          last_updated: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.pityState.user_id,
          set: {
            counter: nextPityCounter,
            last_updated: new Date(),
          },
        });

      // Record wallet transaction
      await tx.insert(schema.walletTransactions).values({
        user_id: user.id,
        amount: -CONFIG.DROP_COST_UD,
        balance_after: newBalance,
        reason: 'DROP_ROLL',
        idempotency_key: idempotencyKey,
      });

      // Record drop history with idempotency key
      await tx.insert(schema.dropHistory).values({
        user_id: user.id,
        item_id: newItem.id,
        pity_counter_at_drop: currentPity,
        cost_ud: CONFIG.DROP_COST_UD,
        idempotency_key: idempotencyKey,
      });

      return reply.send({
        item: newItem,
        newBalance,
        newPityCounter: nextPityCounter,
        scoreBreakdown,
        levelUp: newLevel > currentUser.level,
        newLevel,
      });
    });
  });
}
