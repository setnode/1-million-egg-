import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { player } from '@/services/db/schema';
import { desc, sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';
import { getPonderPrefix } from "@/utils/ponder";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'season'; // 'season' | 'all'
    
    // We cache for 30 seconds
    const cacheKey = `v1:leaderboard:top:${type}`;
    
    const data = await withCache(cacheKey, 30, async () => {
      if (!db) throw new Error("Database not configured");

      const prefix = await getPonderPrefix();
      
      if (type === 'debug_tables') {
        const tables = await db.execute(sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'd1ff__SeasonPlayer'
        `);
        return tables;
      }
      
      if (type === 'all') {
        const result = await db.execute(sql.raw(`
          SELECT 
            id as address, 
            lifetime_points as "lifetimePoints", 
            total_taps as "totalTaps",
            RANK() OVER (ORDER BY lifetime_points DESC) as rank
          FROM "${prefix}Player"
          ORDER BY lifetime_points DESC
          LIMIT 100
        `));
        return result;
      } else {
        const result = await db.execute(sql.raw(`
          SELECT 
            sp.address, 
            sp.season_eggs as "seasonEggs", 
            p.lifetime_points as "lifetimePoints",
            RANK() OVER (ORDER BY sp.season_eggs DESC) as rank
          FROM "${prefix}SeasonPlayer" sp
          LEFT JOIN "${prefix}Player" p ON p.id = sp.address
          ORDER BY sp.season_eggs DESC
          LIMIT 100
        `));
        return result;
      }
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Leaderboard Top API Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
