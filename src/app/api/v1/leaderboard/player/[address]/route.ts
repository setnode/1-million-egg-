import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';
import { getPonderPrefix } from "@/utils/ponder";

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

      const prefix = await getPonderPrefix();
      // We need rank for season and all-time, plus total stats
      const result = await db.execute(sql.raw(`
        WITH PlayerStats AS (
          SELECT id, lifetime_points as "lifetimePoints", last_active as "lastActive", total_taps as "totalTaps"
          FROM "${prefix}Player"
          WHERE id = '${address}'
        ),
        SeasonStats AS (
          SELECT season_eggs as "seasonEggs", season_id as "seasonId"
          FROM "${prefix}SeasonPlayer"
          WHERE address = '${address}'
          ORDER BY season_id DESC
          LIMIT 1
        ),
        AllTimeEggs AS (
          SELECT SUM(season_eggs) as "totalSeasonEggs"
          FROM "${prefix}SeasonPlayer"
          WHERE address = '${address}'
        ),
        AllTimeRank AS (
          SELECT rank FROM (
            SELECT id, RANK() OVER (ORDER BY lifetime_points DESC) as rank
            FROM "${prefix}Player"
          ) ranks WHERE id = '${address}'
        ),
        SeasonRank AS (
          SELECT rank FROM (
            SELECT address, RANK() OVER (ORDER BY season_eggs DESC) as rank
            FROM "${prefix}SeasonPlayer"
            WHERE season_id = (SELECT COALESCE(MAX(season_id), 0) FROM "${prefix}SeasonPlayer" WHERE address = '${address}')
          ) ranks WHERE address = '${address}'
        )
        SELECT 
          ps.id as address,
          ps."lifetimePoints",
          ps."lastActive",
          ps."totalTaps",
          COALESCE(ss."seasonEggs", 0) as "seasonEggs",
          COALESCE(ate."totalSeasonEggs", 0) as "totalSeasonEggs",
          COALESCE(ss."seasonId", 0) as "seasonId",
          COALESCE(ar.rank, 0) as "allTimeRank",
          COALESCE(sr.rank, 0) as "seasonRank"
        FROM PlayerStats ps
        LEFT JOIN SeasonStats ss ON true
        LEFT JOIN AllTimeEggs ate ON true
        LEFT JOIN AllTimeRank ar ON true
        LEFT JOIN SeasonRank sr ON true
      `));

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
