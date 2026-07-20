import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address: rawAddress } = await params;
    const address = rawAddress.toLowerCase();

    // Validate Ethereum address format
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ success: false, error: "Invalid Ethereum address format" }, { status: 400 });
    }
    const cacheKey = `v1:leaderboard:player:${address}`;
    
    const data = await withCache(cacheKey, 15, async () => {
      if (!db) throw new Error("Database not configured");

      // We need rank for season and all-time, plus total stats
      const result = await db.execute(sql`
        WITH UserStats AS (
          SELECT p.id, p."lifetimePoints", p."totalTaps", p."lastActive", sp."seasonEggs"
          FROM "Player" p
          LEFT JOIN "SeasonPlayer" sp ON sp.address = p.id
          WHERE p.id = ${address}
        ),
        SeasonRank AS (
          SELECT COUNT(*) + 1 as rank
          FROM "SeasonPlayer"
          WHERE "seasonEggs" > (SELECT COALESCE("seasonEggs", 0) FROM UserStats)
        ),
        AllTimeRank AS (
          SELECT COUNT(*) + 1 as rank
          FROM "Player"
          WHERE "lifetimePoints" > (SELECT COALESCE("lifetimePoints", 0) FROM UserStats)
        )
        SELECT 
          u.*,
          (SELECT rank FROM SeasonRank) as "seasonRank",
          (SELECT rank FROM AllTimeRank) as "allTimeRank"
        FROM UserStats u;
      `);

      if (result.length === 0) {
        return {
          address,
          seasonEggs: 0,
          lifetimePoints: 0,
          totalTaps: 0,
          seasonRank: 0,
          allTimeRank: 0,
        };
      }

      return result[0];
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Player Stats API Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
