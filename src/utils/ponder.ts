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
        const prefix = `${val.instance_id}__`;
        // Verify table actually exists (protect against ghost/failed Ponder deployments)
        const checkRes = await db.execute(sql.raw(`
          SELECT tablename 
          FROM pg_tables 
          WHERE schemaname = 'public' 
          AND tablename = '${prefix}Player'
        `));
        
        if (checkRes.length > 0) {
          cachedPrefix = prefix;
          lastFetchTime = now;
          return cachedPrefix;
        } else {
          console.warn(`Ponder live instance ${prefix} has no tables. Falling back...`);
        }
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
    
    const instances = [];
    for (const row of fallbackRes) {
       const val = row.value as any;
       if (val && val.instance_id) {
         instances.push({
           id: val.instance_id,
           heartbeat: val.heartbeat_at || 0
         });
       }
    }
    
    // Sort by newest heartbeat first
    instances.sort((a, b) => b.heartbeat - a.heartbeat);
    
    for (const inst of instances) {
      const prefix = `${inst.id}__`;
      const checkRes = await db.execute(sql.raw(`
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = '${prefix}Player'
      `));
      
      if (checkRes.length > 0) {
        cachedPrefix = prefix;
        lastFetchTime = now;
        return cachedPrefix;
      }
    }
    
    // If absolutely nothing is found, return the old hardcoded default or latest anyway
    if (instances.length > 0) {
      cachedPrefix = `${instances[0].id}__`;
    } else {
      cachedPrefix = "ponder.";
    }
    lastFetchTime = now;
    return cachedPrefix;
  } catch (e) {
    console.error("Failed to fetch fallback ponder prefix:", e);
  }

  return "";
}
