import { NextResponse } from 'next/server';
import { db } from '@/services/db';
import { redis } from '@/services/redis';
import { sql } from 'drizzle-orm';
import { getPonderPrefix } from '@/utils/ponder';

export const dynamic = 'force-dynamic';

type Status = 'ok' | 'error' | 'degraded' | 'unconfigured';
type PonderStatus = 'ok' | 'syncing' | 'error' | 'unconfigured';

export async function GET() {
  const redisStatus = await checkRedis();
  const postgresStatus = await checkPostgres();
  const ponderStatus = await checkPonder();

  const allOk =
    redisStatus.status === 'ok' &&
    postgresStatus.status === 'ok' &&
    ponderStatus.status === 'ok';

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        redis: redisStatus,
        postgres: postgresStatus,
        ponder: ponderStatus,
      },
    },
    { status: allOk ? 200 : 503 }
  );
}

async function checkRedis(): Promise<{ status: Status; latencyMs?: number; error?: string }> {
  if (!redis) {
    return { status: 'unconfigured', error: 'UPSTASH_REDIS_REST_URL / TOKEN not set' };
  }
  try {
    const start = Date.now();
    const pong = await redis.ping();
    const latencyMs = Date.now() - start;
    return pong === 'PONG'
      ? { status: 'ok', latencyMs }
      : { status: 'error', error: `Unexpected ping response: ${pong}` };
  } catch (e: any) {
    return { status: 'error', error: e.message };
  }
}

async function checkPostgres(): Promise<{ status: Status; latencyMs?: number; error?: string }> {
  if (!db) {
    return { status: 'unconfigured', error: 'DATABASE_URL not set' };
  }
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    return { status: 'ok', latencyMs };
  } catch (e: any) {
    return { status: 'error', error: e.message };
  }
}

async function checkPonder(): Promise<{
  status: PonderStatus;
  prefix?: string;
  totalPlayers?: number;
  lastActivityAgo?: string;
  warning?: string;
  error?: string;
}> {
  if (!db) {
    return { status: 'unconfigured', error: 'DB not available' };
  }
  try {
    const prefix = await getPonderPrefix();
    if (!prefix) {
      return { status: 'error', error: 'No Ponder instance found in _ponder_meta' };
    }

    const rows = await db.execute(sql.raw(`
      SELECT COUNT(*) AS total_players, MAX(last_active) AS last_active
      FROM "${prefix}Player"
    `));

    const row = (rows[0] ?? {}) as any;
    const totalPlayers = Number(row.total_players ?? 0);
    const lastActive = Number(row.last_active ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    const ageHours = lastActive > 0 ? (nowSec - lastActive) / 3600 : null;
    const lastActivityAgo = ageHours !== null
      ? `${Math.round(ageHours * 10) / 10}h ago`
      : 'no data yet';

    const cleanPrefix = prefix.replace(/__$/, '');

    if (totalPlayers === 0) {
      return { status: 'syncing', prefix: cleanPrefix, totalPlayers, lastActivityAgo };
    }

    if (ageHours !== null && ageHours > 2) {
      return {
        status: 'syncing',
        prefix: cleanPrefix,
        totalPlayers,
        lastActivityAgo,
        warning: 'No events in the last 2h — Ponder may be catching up or stalled',
      };
    }

    return { status: 'ok', prefix: cleanPrefix, totalPlayers, lastActivityAgo };
  } catch (e: any) {
    return { status: 'error', error: e.message };
  }
}
