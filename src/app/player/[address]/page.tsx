import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';

interface Props {
  params: {
    address: string;
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const address = params.address as `0x${string}`;
  
  // We need to fetch data for the OG Image
  let eggs = 0;
  let rank = '-';
  let streak = 0;
  let taps = 0;
  let totalEggs = 0;
  let target = 1000000;

  try {
    // 1. Fetch from Leaderboard API
    // Since this runs on the server, we use an absolute URL or just call the service directly.
    // It's safer to call the Viem public client directly here to avoid absolute URL issues in build time.
    // Use Alchemy explicitly, failing fast if missing to avoid rate limiting
    const rpcUrl = process.env.NEXT_PUBLIC_ALCHEMY_URL || process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL;
    const publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl)
    });

    // Multi-call
    const data = await publicClient.multicall({
      contracts: [
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'scores', args: [address] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'eggBalances', args: [address] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'streakCount', args: [address] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'seasonTarget' },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'seasonTotalEggs' },
      ]
    });

    taps = data[0].result ? Number(data[0].result) : 0;
    eggs = data[1].result ? Number(data[1].result) : 0;
    streak = data[2].result ? Number(data[2].result) : 0;
    target = data[3].result ? Number(data[3].result) : 1000000;
    totalEggs = data[4].result ? Number(data[4].result) : 0;

    // We can't easily get the exact rank without the backend leaderboard service, 
    // but we can try to fetch from the local API if it's available.
    // However, in Vercel Edge/Serverless, calling localhost isn't always reliable.
    // Let's fallback rank to "Top 100" or leave it as "-" if fetch fails.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://1millionegg.xyz';
      const res = await fetch(`${baseUrl}/api/leaderboard?user=${address}`, { next: { revalidate: 60 } });
      if (res.ok) {
        const lbData = await res.json();
        if (lbData?.yourRank?.rank) {
          rank = String(lbData.yourRank.rank);
        }
      }
    } catch (e) {
      console.error("Could not fetch leaderboard for metadata", e);
    }

  } catch (error) {
    console.error("Failed to generate metadata for player:", error);
  }

  // Construct OG Image URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://1millionegg.xyz';
  const ogUrl = new URL(`${baseUrl}/api/og/profile`);
  ogUrl.searchParams.set('user', address);
  ogUrl.searchParams.set('eggs', eggs.toString());
  ogUrl.searchParams.set('rank', rank);
  ogUrl.searchParams.set('streak', streak.toString());
  ogUrl.searchParams.set('taps', taps.toString());
  ogUrl.searchParams.set('totalEggs', totalEggs.toString());
  ogUrl.searchParams.set('target', target.toString());

  const shortUser = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return {
    title: `${shortUser}'s Profile | 1 Million Egg`,
    description: `I've tapped ${taps} times and collected ${eggs} eggs! Think you can beat my score? Join the global egg hunt on Base.`,
    openGraph: {
      title: `${shortUser}'s Profile | 1 Million Egg 🥚`,
      description: `Think you can beat my score? Tap the Egg. Earn Real USDC.`,
      url: `${baseUrl}/player/${address}`,
      images: [
        {
          url: ogUrl.toString(),
          width: 1200,
          height: 630,
          alt: '1 Million Egg Player Profile',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${shortUser}'s Profile | 1 Million Egg 🥚`,
      description: `Think you can beat my score? Tap the Egg. Earn Real USDC.`,
      images: [ogUrl.toString()],
    },
  };
}

export default function PlayerPage() {
  // In the future, this can be a real profile page.
  // For now, redirect to the main app so they can play.
  redirect('/');
}
