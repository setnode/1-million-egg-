import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';
import { getPonderPrefix } from "@/utils/ponder";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cacheKey = `v1:leaderboard:recent`;
    
    const data = await withCache(cacheKey, 10, async () => {
      if (!db) throw new Error("Database not configured");

      const prefix = await getPonderPrefix();
      const result = await db.execute(sql.raw(`
        SELECT 
          id, 
          player as address, 
          new_score as "newScore", 
          block_timestamp as "timestamp"
        FROM "${prefix}TapEvent"
        ORDER BY block_timestamp DESC, log_index DESC
        LIMIT 50
      `));

      return result;
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Leaderboard Recent API Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
