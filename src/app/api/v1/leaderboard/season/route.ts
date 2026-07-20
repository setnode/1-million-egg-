import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cacheKey = `v1:leaderboard:season`;
    
    const data = await withCache(cacheKey, 30, async () => {
      if (!db) throw new Error("Database not configured");

      const result = await db.execute(sql`
        SELECT id, target, total_eggs as "totalEggs"
        FROM ponder.season
        ORDER BY id DESC
        LIMIT 1
      `);

      if (result.length === 0) {
        return { id: 0, target: 1000000, totalEggs: 0 };
      }

      return result[0];
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Season API Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
