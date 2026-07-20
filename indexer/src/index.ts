import { ponder } from "@/generated";

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
  await context.db.tapEvent.upsert({
    id: eventId,
    create: {
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
    },
    update: {}
  });

  // 2. Upsert Player Aggregate
  const existingPlayer = await context.db.player.findUnique({ id: playerId });
  if (existingPlayer) {
    await context.db.player.update({
      id: playerId,
      data: {
        lifetimePoints: newScore,
        lastActive: event.block.timestamp,
        totalTaps: existingPlayer.totalTaps + 1,
      }
    });
  } else {
    await context.db.player.create({
      id: playerId,
      data: {
        lifetimePoints: newScore,
        lastActive: event.block.timestamp,
        totalTaps: 1,
      }
    });
  }

  // 3. Update Season.totalEggs using globalScore (the contract's global counter)
  await context.db.season.upsert({
    id: currentSeasonId,
    create: {
      target: 0n,
      totalEggs: globalScore,
    },
    update: {
      totalEggs: globalScore,
    }
  });
});

ponder.on("MillionEgg:RewardClaimed", async ({ event, context }) => {
  const { player, usdcAmount, eggsSpent } = event.args;
  const playerId = formatId(player);
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  // Upsert Raw Event (idempotent)
  await context.db.rewardClaim.upsert({
    id: eventId,
    create: {
      blockNumber: event.block.number,
      blockTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
      chainId: context.network.chainId,
      contractAddress: formatId(event.log.address),
      
      player: playerId,
      usdcAmount: usdcAmount,
      eggsSpent: eggsSpent,
    },
    update: {}
  });
});

ponder.on("MillionEgg:DailyClaimed", async ({ event, context }) => {
  const { player, currentStreak, eggsGiven } = event.args;
  const playerId = formatId(player);
  const eventId = `${event.transaction.hash}-${event.log.logIndex}`;

  // Upsert Raw Event (idempotent)
  await context.db.dailyCheckin.upsert({
    id: eventId,
    create: {
      blockNumber: event.block.number,
      blockTimestamp: event.block.timestamp,
      transactionHash: event.transaction.hash,
      logIndex: event.log.logIndex,
      chainId: context.network.chainId,
      contractAddress: formatId(event.log.address),
      
      player: playerId,
      streak: currentStreak,
      eggsGiven: eggsGiven,
    },
    update: {}
  });
});

ponder.on("MillionEgg:SeasonEggsUpdated", async ({ event, context }) => {
  const { season, player, newBalance } = event.args;
  const playerId = formatId(player);
  const seasonId = Number(season);
  const seasonPlayerId = `${playerId}-${seasonId}`;

  // Update SeasonPlayer Aggregate
  await context.db.seasonPlayer.upsert({
    id: seasonPlayerId,
    create: {
      address: playerId,
      seasonId: seasonId,
      seasonEggs: newBalance,
    },
    update: {
      seasonEggs: newBalance,
    }
  });
});

ponder.on("MillionEgg:SeasonTargetUpdated", async ({ event, context }) => {
  const { newTarget } = event.args;
  
  // FIX 13: Use currentSeasonId instead of hardcoded 0
  await context.db.season.upsert({
    id: currentSeasonId,
    create: {
      target: newTarget,
      totalEggs: 0n,
    },
    update: {
      target: newTarget,
    }
  });
});

// FIX 5: SeasonChanged event handler
ponder.on("MillionEgg:SeasonChanged", async ({ event, context }) => {
  const { oldSeason, newSeason } = event.args;
  const newSeasonId = Number(newSeason);
  
  // Update tracked season ID
  currentSeasonId = newSeasonId;

  // Create new season entry
  await context.db.season.upsert({
    id: newSeasonId,
    create: {
      target: 0n, // Will be set by SeasonTargetUpdated
      totalEggs: 0n,
    },
    update: {} // If already exists, don't overwrite
  });
});

// FIX 12: StreakRestored event handler
ponder.on("MillionEgg:StreakRestored", async ({ event, context }) => {
  const { player, restoredStreak } = event.args;
  const playerId = formatId(player);

  // Update player's last active timestamp when streak is restored
  const existingPlayer = await context.db.player.findUnique({ id: playerId });
  if (existingPlayer) {
    await context.db.player.update({
      id: playerId,
      data: {
        lastActive: event.block.timestamp,
      }
    });
  }
});
