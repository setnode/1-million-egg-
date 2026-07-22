import { db, playerFid, notificationToken, notificationQueue } from "../db";
import { inArray, eq, and, lte } from "drizzle-orm";

export async function fetchBatch() {
  if (!db) return [];

  try {
    const batch = await db.transaction(async (tx) => {
      // 1. Fetch pending items whose sendAt is in the past (FOR UPDATE SKIP LOCKED)
      const pending = await tx.select()
        .from(notificationQueue)
        .where(
          and(
            eq(notificationQueue.status, 'pending'),
            lte(notificationQueue.sendAt, Math.floor(Date.now() / 1000))
          )
        )
        .limit(50)
        .for('update', { skipLocked: true });

      if (pending.length === 0) return [];

      // 2. Mark them as processing within the same transaction
      const ids = pending.map(p => p.id);
      await tx.update(notificationQueue)
        .set({ status: 'processing' })
        .where(inArray(notificationQueue.id, ids));

      return pending;
    });

    return batch;
  } catch (err) {
    console.error("[Worker] DB fetchBatch error:", err);
    return [];
  }
}

export async function getTokensForBatch(playerAddresses: string[]) {
  if (!db || playerAddresses.length === 0) return [];

  try {
    const tokens = await db.select({
      address: playerFid.address,
      url: notificationToken.notificationUrl,
      token: notificationToken.notificationToken
    })
    .from(playerFid)
    .innerJoin(notificationToken, eq(playerFid.fid, notificationToken.fid))
    .where(inArray(playerFid.address, playerAddresses));

    return tokens;
  } catch (err) {
    console.error("[Worker] DB getTokens error:", err);
    return [];
  }
}

export async function updateStatus(id: string, status: string, retryCount: number, sendAt: number) {
  if (!db) return;
  try {
    await db.update(notificationQueue)
      .set({ status, retryCount, sendAt })
      .where(eq(notificationQueue.id, id));
  } catch (err) {
    console.error(`[Worker] Failed to update status for ${id}:`, err);
  }
}
