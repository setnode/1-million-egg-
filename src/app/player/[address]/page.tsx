import { Metadata } from 'next';

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';

interface Props {
  params: Promise<{
    address: string;
  }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const address = params.address as `0x${string}`;
  
  // We need to fetch data for the OG Image
  let eggs = 0;
  let rank = '-';
  let streak = 0;
  let taps = 0;
  let totalEggs = 0;
  let target = 1000000;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://1millionegg.xyz';
    const res = await fetch(`${baseUrl}/api/profile?user=${address}`, { next: { revalidate: 60 } });
    
    if (res.ok) {
      const profileData = await res.json();
      
      // Console logging the debug info as requested by the user
      console.log(`[OG Metadata Debug] Data Source for ${address}:`, profileData.dataSource);
      console.log(`[OG Metadata Debug] JSON Payload:`, JSON.stringify(profileData));

      eggs = profileData.seasonEggs || 0;
      rank = String(profileData.rank || '-');
      streak = profileData.streak || 0;
      taps = profileData.lifetimeTaps || 0;
      totalEggs = profileData.seasonTotalEggs || 0;
      target = profileData.seasonTarget || 1000000;
    } else {
      console.error("Profile API returned error:", await res.text());
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
  // We MUST NOT use server-side redirect() here!
  // If we return HTTP 307, Twitter/Farcaster bots will follow the redirect to "/" 
  // and scrape the default layout metadata (egg.png) instead of this page's dynamic OG image.
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0B0F', color: '#F59E0B', fontFamily: 'sans-serif' }}>
      <p>Loading player profile...</p>
      <script dangerouslySetInnerHTML={{ __html: `window.location.href = "/";` }} />
    </div>
  );
}
