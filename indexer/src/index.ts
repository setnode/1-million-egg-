import { ponder } from "@/generated";
import * as schema from "../ponder.schema";
import { db } from "../../src/services/db";
import { notificationQueue } from "../../src/services/db/schema";

// Ensure all addresses are lowercase
const formatId = (address: string) => address.toLowerCase();

// Track current season ID (updated by SeasonChanged events)
let currentSeasonId = 0;

ponder.on("MillionEgg:Tapped", async ({ event, context }) => {
  const { player, newScore, globalScore, newEggBalance } = event.args;
  const playerId = formatId(player);
  
  const txHash = event.transaction.hash;
  const logIndex = event.log.logIndex;
  const eventId = `${txHash}-${logIndex}`;

  // 1. Upsert Raw Event (idempotent)
  await context.db.insert(schema.tapEvent).values({
    id: eventId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: txHash,
    logIndex: logIndex,
    chainId: context.network.chainId,
    contractAddress: formatId(event.log.address),
    player: playerId,
    newScore: newScore,
    globalScore: globalScore,
    newEggBalance: newEggBalance,
  }).onConflictDoNothing();

  // 2. Upsert Player Aggregate
  const existingPlayer = await context.db.find(schema.player, { id: playerId });
  if (existingPlayer) {
    await context.db.update(schema.player, { id: playerId }).set({
      lifetimePoints: newScore,
      lastActive: event.block.timestamp,
      totalTaps: existingPlayer.totalTaps + 1,
    });
  } else {
    await context.db.insert(schema.player).values({
      id: playerId,
      lifetimePoints: newScore,
      lastActive: event.block.timestamp,
      totalTaps: 1,
    });
  }

  // 3. Update Season.totalEggs using globalScore (the contract's global counter)
  await context.db.insert(schema.season).values({
    id: currentSeasonId,
    target: 0n,
    totalEggs: globalScore,
  }).onConflictDoUpdate({
    totalEggs: globalScore,
  });
});

ponder.on("MillionEgg:RewardClaimed", async ({ event, context }) => {
  const { player, usdcAmount, eggsSpent } = event.args;
  const playerId = formatId(player);
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  // Upsert Raw Event (idempotent)
  await context.db.insert(schema.rewardClaim).values({
    id: eventId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    chainId: context.network.chainId,
    contractAddress: formatId(event.log.address),
    player: playerId,
    usdcAmount: usdcAmount,
    eggsSpent: eggsSpent,
  }).onConflictDoNothing();
});

ponder.on("MillionEgg:DailyClaimed", async ({ event, context }) => {
  const { player, currentStreak, eggsGiven } = event.args;
  const playerId = formatId(player);
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  // Upsert Raw Event (idempotent)
  await context.db.insert(schema.dailyCheckin).values({
    id: eventId,
    blockNumber: event.block.number,
    blockTimestamp: event.block.timestamp,
    transactionHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    chainId: context.network.chainId,
    contractAddress: formatId(event.log.address),
    player: playerId,
    streak: currentStreak,
    eggsGiven: eggsGiven,
  }).onConflictDoNothing();

  // Update Player aggregate: add daily eggs to lifetimePoints
  const existingPlayer = await context.db.find(schema.player, { id: playerId });
  if (existingPlayer) {
    await context.db.update(schema.player, { id: playerId }).set({
      lifetimePoints: existingPlayer.lifetimePoints + eggsGiven,
      lastActive: event.block.timestamp,
    });
  } else {
    // Player doesn't exist yet — create with daily eggs as initial lifetime points
    await context.db.insert(schema.player).values({
      id: playerId,
      lifetimePoints: eggsGiven,
      lastActive: event.block.timestamp,
      totalTaps: 0,
    });
  }

  // --- Notification Engine: Enqueue Daily Claim Reminder ---
  // Isolate this logic to prevent any side effects on the main indexer
  const ONE_HOUR = 3600n;
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
  
  // Only queue if the event happened in the last hour (prevents spam during Ponder historical sync)
  if (db && event.block.timestamp > currentTimestamp - ONE_HOUR) {
    const sendAtTime = Number(event.block.timestamp) + 86400; // 24 hours later
    try {
      await db.insert(notificationQueue).values({
        playerAddress: playerId,
        type: 'daily_claim',
        sendAt: sendAtTime,
        status: 'pending',
        retryCount: 0,
      }).onConflictDoNothing();
    } catch (err) {
      console.error("[Notification Engine] Failed to enqueue daily claim reminder:", err);
    }
  }
});

ponder.on("MillionEgg:SeasonEggsUpdated", async ({ event, context }) => {
  const { season, player, newBalance } = event.args;
  const playerId = formatId(player);
  const seasonId = Number(season);
  const seasonPlayerId = `${playerId}-${seasonId}`;

  // Update SeasonPlayer Aggregate
  await context.db.insert(schema.seasonPlayer).values({
    id: seasonPlayerId,
    address: playerId,
    seasonId: seasonId,
    seasonEggs: newBalance,
  }).onConflictDoUpdate({
    seasonEggs: newBalance,
  });
});

ponder.on("MillionEgg:SeasonTargetUpdated", async ({ event, context }) => {
  const { newTarget } = event.args;
  
  // FIX 13: Use currentSeasonId instead of hardcoded 0
  await context.db.insert(schema.season).values({
    id: currentSeasonId,
    target: newTarget,
    totalEggs: 0n,
  }).onConflictDoUpdate({
    target: newTarget,
  });
});

// FIX 5: SeasonChanged event handler
ponder.on("MillionEgg:SeasonChanged", async ({ event, context }) => {
  const { oldSeason, newSeason } = event.args;
  const newSeasonId = Number(newSeason);
  
  // Update tracked season ID
  currentSeasonId = newSeasonId;

  // Create new season entry
  await context.db.insert(schema.season).values({
    id: newSeasonId,
    target: 0n, // Will be set by SeasonTargetUpdated
    totalEggs: 0n,
  }).onConflictDoNothing();
});

// FIX 12: StreakRestored event handler
ponder.on("MillionEgg:StreakRestored", async ({ event, context }) => {
  const { player, restoredStreak } = event.args;
  const playerId = formatId(player);

  // Update player's last active timestamp when streak is restored
  const existingPlayer = await context.db.find(schema.player, { id: playerId });
  if (existingPlayer) {
    await context.db.update(schema.player, { id: playerId }).set({
      lastActive: event.block.timestamp,
    });
  }
});
