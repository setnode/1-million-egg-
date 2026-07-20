import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';
import { getPonderPrefix } from "@/utils/ponder";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cacheKey = `v1:leaderboard:stats`;
    
    const data = await withCache(cacheKey, 60, async () => {
      if (!db) throw new Error("Database not configured");

      const prefix = await getPonderPrefix();
      const result = await db.execute(sql.raw(`
        SELECT 
          SUM(lifetime_points) as "globalPoints",
          SUM(total_taps) as "globalTaps",
          COUNT(*) as "totalPlayers"
        FROM "${prefix}Player"
      `));

      return result[0];
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Leaderboard Stats API Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
