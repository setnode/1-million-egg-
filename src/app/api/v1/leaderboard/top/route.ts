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
          SELECT tablename, (xpath('/row/cnt/text()', xml_count))[1]::text::int as row_count
          FROM (
            SELECT tablename, query_to_xml(format('select count(*) as cnt from public.%I', tablename), false, true, '') as xml_count
            FROM pg_tables
            WHERE schemaname = 'public' AND tablename NOT LIKE '%reorg%' AND tablename NOT LIKE '\_%'
          ) t
          ORDER BY row_count DESC
        `);
        return tables;
      }
      
      if (type === 'all') {
        const result = await db.execute(sql.raw(`
          SELECT 
            p.id as address, 
            p.lifetime_points as "lifetimePoints", 
            p.total_taps as "totalTaps",
            COALESCE(se.total_eggs, 0) as "totalSeasonEggs",
            RANK() OVER (ORDER BY p.lifetime_points DESC) as rank
          FROM "${prefix}Player" p
          LEFT JOIN (
            SELECT address, SUM(season_eggs) as total_eggs 
            FROM "${prefix}SeasonPlayer" 
            GROUP BY address
          ) se ON p.id = se.address
          ORDER BY p.lifetime_points DESC
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
