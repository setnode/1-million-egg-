import { db } from "@/services/db";
import { sql } from "drizzle-orm";

let cachedPrefix: string | null = null;
let lastFetchTime = 0;

export async function getPonderPrefix(): Promise<string> {
  const now = Date.now();
  // Cache for 1 minute
  if (cachedPrefix !== null && now - lastFetchTime < 60000) {
    return cachedPrefix;
  }

  if (!db) return "";

  try {
    const metaRes = await db.execute(sql`
      SELECT value FROM _ponder_meta WHERE key = 'live'
    `);
    
    if (metaRes.length > 0 && metaRes[0].value) {
      const val = metaRes[0].value as any;
      if (val.instance_id) {
        cachedPrefix = `${val.instance_id}__`;
        lastFetchTime = now;
        return cachedPrefix;
      }
    }
  } catch (e) {
    console.error("Failed to fetch ponder live prefix:", e);
  }

  // Fallback to highest heartbeat if 'live' doesn't exist
  try {
    const fallbackRes = await db.execute(sql`
      SELECT value FROM _ponder_meta WHERE key LIKE 'app_%'
    `);
    
    let maxHeartbeat = 0;
    let latestInstance = '';
    
    for (const row of fallbackRes) {
       const val = row.value as any;
       if (val && val.heartbeat_at > maxHeartbeat) {
         maxHeartbeat = val.heartbeat_at;
         latestInstance = val.instance_id;
       }
    }
    if (latestInstance) {
      cachedPrefix = `${latestInstance}__`;
      lastFetchTime = now;
      return cachedPrefix;
    }
  } catch (e) {
    console.error("Failed to fetch fallback ponder prefix:", e);
  }

  return "";
}
