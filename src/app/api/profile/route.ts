import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get('user');

    if (!user) {
      return NextResponse.json({ error: "User address is required" }, { status: 400 });
    }

    const address = user.toLowerCase() as `0x${string}`;

    // 1. Fetch from Drizzle DB (Fast Leaderboard Index)
    let dbPlayer: any = { seasonEggs: 0, lifetimePoints: 0, seasonRank: 0 };
    let dbSeason: any = { totalEggs: 0, target: 1000000 };
    let totalPlayers = 0;

    if (db) {
      const [playerRes, seasonRes, statsRes] = await Promise.all([
        db.execute(sql`
          WITH UserStats AS (
            SELECT p.id, p."lifetimePoints", sp."seasonEggs"
            FROM "Player" p
            LEFT JOIN "SeasonPlayer" sp ON sp.address = p.id
            WHERE p.id = ${address}
          ),
          SeasonRank AS (
            SELECT COUNT(*) + 1 as rank
            FROM "SeasonPlayer"
            WHERE "seasonEggs" > (SELECT COALESCE("seasonEggs", 0) FROM UserStats)
          )
          SELECT u.*, (SELECT rank FROM SeasonRank) as "seasonRank" FROM UserStats u;
        `),
        db.execute(sql`SELECT "target", "totalEggs" FROM "Season" WHERE id = 0`),
        db.execute(sql`SELECT COUNT(*) as "total" FROM "Player"`)
      ]);

      if (playerRes.length > 0) dbPlayer = playerRes[0];
      if (seasonRes.length > 0) dbSeason = seasonRes[0];
      if (statsRes.length > 0) totalPlayers = Number(statsRes[0].total);
    }

    // 2. Fetch the remaining exact stats that Dashboard uses but Leaderboard doesn't index (Streak)
    const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_URL || process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "https://mainnet.base.org";
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl)
    });

    const streakCount = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'streakCount',
      args: [address]
    }) as bigint;

    // Compile Unified Profile Model
    const profileData = {
      address,
      seasonEggs: dbPlayer.seasonEggs || 0,
      rank: dbPlayer.seasonRank || totalPlayers + 1,
      lifetimeTaps: dbPlayer.lifetimePoints || 0,
      streak: Number(streakCount),
      seasonTotalEggs: Number(dbSeason.totalEggs || 0),
      seasonTarget: Number(dbSeason.target || 1000000),
      dataSource: "Unified Profile API (Drizzle + Viem Streak)"
    };

    return NextResponse.json(profileData);
  } catch (error: any) {
    console.error("Profile API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
