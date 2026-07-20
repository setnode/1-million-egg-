import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cacheKey = `v1:leaderboard:stats`;
    
    const data = await withCache(cacheKey, 60, async () => {
      if (!db) throw new Error("Database not configured");

      const result = await db.execute(sql`
        SELECT 
          COUNT(*) as "totalPlayers",
          SUM("lifetimePoints") as "globalPoints",
          SUM("totalTaps") as "globalTaps"
        FROM "Player"
      `);

      return result[0];
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Leaderboard Stats API Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
