import { NextResponse } from 'next/server';
import { ViemLeaderboardService } from '@/services/leaderboard';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';

export const dynamic = "force-dynamic";

const leaderboardService = new ViemLeaderboardService();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get('user');

    if (!user) {
      return NextResponse.json({ error: "User address is required" }, { status: 400 });
    }

    const address = user as `0x${string}`;

    // 1. Fetch from Leaderboard (Redis/Indexer cache)
    // This provides Rank, Season Eggs, Lifetime Taps, Target, Total Eggs without hitting RPC directly (cached)
    const lbData = await leaderboardService.getLeaderboard('0', address);
    
    // 2. Fetch the remaining exact stats that Dashboard uses but Leaderboard doesn't index (Streak)
    // We use the same Alchemy RPC logic
    const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_URL || process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL;
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl)
    });

    const streakCount = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'streakCount',
      args: [address]
    }) as bigint;

    // Compile Unified Profile Model
    const profileData = {
      address,
      seasonEggs: lbData.yourRank?.seasonEggs || 0,
      rank: lbData.yourRank?.rank || lbData.totalPlayers + 1,
      lifetimeTaps: lbData.yourRank?.lifetimePoints || 0,
      streak: Number(streakCount),
      seasonTotalEggs: lbData.seasonTotalEggs,
      seasonTarget: lbData.seasonTarget,
      dataSource: "Unified Profile API (Leaderboard Cache + Viem Streak)"
    };

    return NextResponse.json(profileData);
  } catch (error: any) {
    console.error("Profile API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
