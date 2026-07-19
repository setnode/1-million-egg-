import { createPublicClient, parseAbiItem } from 'viem';
import { base } from 'viem/chains';
import { getViemTransport, isAlchemyActive } from '@/config/rpc';
import { CONTRACT_ADDRESS, CONTRACT_ABI, DEPLOY_BLOCK } from '@/constants/contract';
import { Redis } from '@upstash/redis';

export interface LeaderboardPlayer {
  rank: number;
  address: string;
  seasonEggs: number;
  lifetimePoints: number;
}

export interface LeaderboardResponse {
  season: string | number;
  updatedAt: string;
  lastProcessedBlock: number;
  seasonTarget: number;
  seasonTotalEggs: number;
  totalPlayers: number;
  topPlayers: LeaderboardPlayer[];
  yourRank?: LeaderboardPlayer;
}

export interface ILeaderboardService {
  getLeaderboard(season: string, userAddress?: string): Promise<LeaderboardResponse>;
}

// In-memory cache for incremental indexing
interface LeaderboardCacheState {
  lastProcessedBlock: bigint;
  players: Map<string, { seasonEggs: number; lifetimePoints: number }>;
}

const globalCache: Record<string, LeaderboardCacheState> = {};

// Upstash Redis configuration
// We don't throw error if missing, to allow the app to work with memory cache only if envs are missing.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

interface RedisCacheState {
  lastProcessedBlock: string;
  players: Record<string, { seasonEggs: number; lifetimePoints: number }>;
}

const publicClient = createPublicClient({
  chain: base,
  transport: getViemTransport(base.id),
});

let rpcStateCache = {
  seasonTarget: 1000000n,
  seasonTotalEggs: 0n,
  currentBlock: 0n,
  lastFetched: 0
};

export class ViemLeaderboardService implements ILeaderboardService {
  async getLeaderboard(seasonStr: string, userAddress?: string): Promise<LeaderboardResponse> {
    const isAllTime = seasonStr === 'all';
    const season = isAllTime ? 0 : parseInt(seasonStr, 10);
    
    const seasonKey = seasonStr;
    const redisKey = `leaderboard_mainnet_cache_${season}`;
    const lockKey = `leaderboard_mainnet_lock_${season}`;

    // 1. Initialize State
    let lastProcessedBlock = DEPLOY_BLOCK - 1n;
    let players = new Map<string, { seasonEggs: number; lifetimePoints: number }>();

    // 2. Read from Redis (Primary) or globalCache (Fallback)
    try {
      if (redis) {
        const cachedData = await redis.get<RedisCacheState>(redisKey);
        if (cachedData) {
          lastProcessedBlock = BigInt(cachedData.lastProcessedBlock);
          if (cachedData.players) {
            Object.entries(cachedData.players).forEach(([addr, data]) => {
              players.set(addr, data);
            });
          }
        }
      } else if (globalCache[seasonKey]) {
        lastProcessedBlock = globalCache[seasonKey].lastProcessedBlock;
        players = globalCache[seasonKey].players;
      }
    } catch (err) {
      console.warn("Redis read error, falling back to memory:", err);
      if (globalCache[seasonKey]) {
        lastProcessedBlock = globalCache[seasonKey].lastProcessedBlock;
        players = globalCache[seasonKey].players;
      }
    }

    // 3. Fetch global states & block ONLY if cache is older than 15 seconds
    // This prevents massive rate limit spikes when thousands of users load the API.
    const now = Date.now();
    if (now - rpcStateCache.lastFetched > 15000) {
      try {
        const [seasonTarget, seasonTotalEggs, currentBlock] = await Promise.all([
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'seasonTarget',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'seasonTotalEggs',
          }) as Promise<bigint>,
          publicClient.getBlockNumber()
        ]);
        
        rpcStateCache = {
          seasonTarget,
          seasonTotalEggs,
          currentBlock,
          lastFetched: now
        };
      } catch (err) {
        console.error("Failed to fetch RPC state, using stale cache:", err);
      }
    }

    const { seasonTarget, seasonTotalEggs, currentBlock } = rpcStateCache;

    // 3. Incremental Indexing (if behind)
    if (lastProcessedBlock < currentBlock) {
      // Try to acquire distributed lock (15 seconds)
      let hasLock = true;
      if (redis) {
        try {
          // nx: true ensures it only sets if it doesn't exist
          const acquired = await redis.set(lockKey, '1', { nx: true, ex: 15 });
          if (!acquired) hasLock = false;
        } catch (e) {
          console.warn("Failed to acquire Redis lock:", e);
        }
      }

      if (hasLock) {
        // We have the lock! Let's fetch new blocks.
        const activePlayersSinceLastBlock = new Set<string>();
        let newLogs: any[] = [];
        let CHUNK_SIZE = isAlchemyActive ? 9999n : 1999n; 
        const startBlock = lastProcessedBlock + 1n;
        const eventSignature = parseAbiItem('event SeasonEggsUpdated(uint256 indexed season, address indexed player, uint256 newBalance)');
        
        let start = startBlock;
        while (start <= currentBlock) {
          let end = start + CHUNK_SIZE;
          if (end > currentBlock) end = currentBlock;
          
          try {
            const chunkLogs = await publicClient.getLogs({
              address: CONTRACT_ADDRESS,
              event: eventSignature,
              args: isAllTime ? undefined : { season: BigInt(season) },
              fromBlock: start,
              toBlock: end
            });
            newLogs = newLogs.concat(chunkLogs);
            start = end + 1n; // Move forward on success
          } catch (err: any) {
            const errorText = (err.details || err.message || '').toLowerCase();
            // If the active transport (e.g. fallback public RPC) rejects the large chunk
            if (errorText.includes('exceeds max block') || errorText.includes('block range') || errorText.includes('too large') || errorText.includes('10,000 range')) {
              console.warn(`[Leaderboard] RPC block range limit hit. Reducing CHUNK_SIZE from ${CHUNK_SIZE} to 1999.`);
              if (CHUNK_SIZE <= 1999n) {
                // If it's already small and still failing, throw to prevent infinite loop
                throw err;
              }
              CHUNK_SIZE = 1999n;
              // Do not increment `start`, the while loop will automatically retry with smaller chunk
            } else {
              console.error(`[Leaderboard] RPC failed on chunk ${start}-${end}:`, errorText);
              throw err;
            }
          }
        }

        // Process new logs
        for (const log of newLogs) {
          if (!log.args.player || log.args.newBalance === undefined) continue;
          const addr = log.args.player.toLowerCase();
          
          const existingData = players.get(addr) || { seasonEggs: 0, lifetimePoints: 0 };
          players.set(addr, {
            ...existingData,
            seasonEggs: Number(log.args.newBalance)
          });
          
          activePlayersSinceLastBlock.add(addr);
        }

        lastProcessedBlock = currentBlock;

        // Fetch Lifetime Points (scores) ONLY for active players
        const playersToUpdate = Array.from(activePlayersSinceLastBlock) as `0x${string}`[];
        
        if (playersToUpdate.length > 0) {
          const multicallResults = await publicClient.multicall({
            contracts: playersToUpdate.map(addr => ({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'scores',
              args: [addr],
            })),
          });

          playersToUpdate.forEach((addr, index) => {
            const res = multicallResults[index];
            const newScore = res.status === 'success' ? (res.result as bigint) : 0n;
            const addrKey = addr.toLowerCase();
            
            const existingData = players.get(addrKey)!;
            players.set(addrKey, {
              ...existingData,
              lifetimePoints: Number(newScore)
            });
          });
        }

        // Save to Redis and Memory
        globalCache[seasonKey] = { lastProcessedBlock, players };
        
        if (redis) {
          try {
            const playersRecord: Record<string, any> = {};
            players.forEach((val, key) => { playersRecord[key] = val; });
            await redis.set(redisKey, {
              lastProcessedBlock: lastProcessedBlock.toString(),
              players: playersRecord
            });
          } catch (e) {
             console.error("Failed to save to Redis:", e);
          }
        }
      } else {
        // Another instance is scanning. We just use the stale data we read!
        console.log(`[Leaderboard] Instance is locked for ${seasonKey}. Serving stale data.`);
      }
    }

    // 4. Assemble and sort the leaderboard
    let playersArr: LeaderboardPlayer[] = Array.from(players.entries()).map(([addr, data]) => ({
      rank: 0,
      address: addr,
      seasonEggs: data.seasonEggs,
      lifetimePoints: data.lifetimePoints
    }));

    if (isAllTime) {
      playersArr.sort((a, b) => b.lifetimePoints - a.lifetimePoints);
    } else {
      playersArr.sort((a, b) => b.seasonEggs - a.seasonEggs);
    }

    // Assign rank
    playersArr.forEach((p, i) => { p.rank = i + 1; });

    // Determine the specific user's rank
    let yourRank: LeaderboardPlayer | undefined;
    if (userAddress) {
      const lower = userAddress.toLowerCase();
      yourRank = playersArr.find(p => p.address === lower);
      if (!yourRank) {
        yourRank = { rank: playersArr.length + 1, address: lower, seasonEggs: 0, lifetimePoints: 0 };
      }
    }

    return {
      season: seasonStr,
      updatedAt: new Date().toISOString(),
      lastProcessedBlock: Number(currentBlock),
      seasonTarget: Number(seasonTarget),
      seasonTotalEggs: Number(seasonTotalEggs),
      totalPlayers: playersArr.length,
      topPlayers: playersArr.slice(0, 50),
      yourRank
    };
  }
}
