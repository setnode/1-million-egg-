import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { sql } from 'drizzle-orm';
import { withCache } from '@/services/redis';
import { getPonderPrefix } from '@/utils/ponder';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawAddress = searchParams.get('address');
    const address = rawAddress?.toLowerCase() ?? null;

    if (!db) throw new Error('Database not configured');
    const prefix = await getPonderPrefix();

    // ── Global data ───────────────────────────────────────────────────────────
    // Identical for every visitor. Cache aggressively.
    const globalData = await withCache('v1:home:global', 60, async () => {
      const [seasonRows, statsRows] = await Promise.all([
        db!.execute(sql.raw(`
          SELECT id AS "currentSeason", target AS "seasonTarget", total_eggs AS "seasonTotalEggs"
          FROM "${prefix}Season"
          ORDER BY id DESC
          LIMIT 1
        `)),
        db!.execute(sql.raw(`
          SELECT COUNT(*) AS "totalPlayers"
          FROM "${prefix}Player"
        `)),
      ]);

      const s = (seasonRows[0] ?? {}) as any;
      const st = (statsRows[0] ?? {}) as any;

      const rawTarget = Number(s.seasonTarget ?? 0);

      return {
        currentSeason: Number(s.currentSeason ?? 0),
        seasonTarget: rawTarget > 0 ? rawTarget : 1_000_000,
        seasonTotalEggs: Number(s.seasonTotalEggs ?? 0),
        totalPlayers: Number(st.totalPlayers ?? 0),
      };
    });

    // No address → return only global data (e.g. logged-out users)
    if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ success: true, data: { global: globalData, player: null } });
    }

    // ── Per-user data ─────────────────────────────────────────────────────────
    // Cached per address. Invalidated on the client after a transaction confirms.
    const playerData = await withCache(`v1:home:player:${address}`, 15, async () => {
      const currentSeason = globalData.currentSeason;

      // Round 1: basic stats + season egg totals (two parallel queries, one DB round-trip)
      const [playerRows, seasonEggRows] = await Promise.all([
        db!.execute(sql.raw(`
          SELECT lifetime_points AS "lifetimePoints", total_taps AS "totalTaps"
          FROM "${prefix}Player"
          WHERE id = '${address}'
        `)),
        db!.execute(sql.raw(`
          SELECT
            COALESCE(SUM(CASE WHEN season_id = ${currentSeason} THEN season_eggs ELSE 0 END), 0) AS "seasonEggs",
            COALESCE(SUM(season_eggs), 0) AS "totalSeasonEggs"
          FROM "${prefix}SeasonPlayer"
          WHERE address = '${address}'
        `)),
      ]);

      const player = (playerRows[0] ?? {}) as any;
      const seData = (seasonEggRows[0] ?? {}) as any;

      const lifetimePoints = Number(player.lifetimePoints ?? 0);
      const totalTaps = Number(player.totalTaps ?? 0);
      const seasonEggs = Number(seData.seasonEggs ?? 0);
      const totalSeasonEggs = Number(seData.totalSeasonEggs ?? 0);

      // Round 2: rank via COUNT — much cheaper than RANK() OVER on large tables.
      // Works correctly because idx_player_lifetime_points and idx_season_player_eggs exist.
      const [allTimeRankRows, seasonRankRows] = await Promise.all([
        db!.execute(sql.raw(`
          SELECT COUNT(*) + 1 AS rank
          FROM "${prefix}Player"
          WHERE lifetime_points > ${lifetimePoints}
        `)),
        db!.execute(sql.raw(`
          SELECT COUNT(*) + 1 AS rank
          FROM "${prefix}SeasonPlayer"
          WHERE season_eggs > ${seasonEggs} AND season_id = ${currentSeason}
        `)),
      ]);

      return {
        lifetimePoints,
        totalTaps,
        seasonEggs,
        totalSeasonEggs,
        allTimeRank: Number((allTimeRankRows[0] as any)?.rank ?? 1),
        seasonRank: Number((seasonRankRows[0] as any)?.rank ?? 1),
      };
    });

    return NextResponse.json({ success: true, data: { global: globalData, player: playerData } });
  } catch (error: unknown) {
    console.error('Home API Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
