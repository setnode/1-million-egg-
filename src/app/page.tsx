'use client';

import { useState, useCallback, useEffect } from 'react';
import { Share2, Copy } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useConnect,
  useDisconnect,
} from 'wagmi';
import { parseEther } from 'viem';
import toast, { Toaster } from 'react-hot-toast';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';
import sdk from '@farcaster/frame-sdk';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LandingPage } from '@/components/landing/LandingPage';
import { DailyClaimSection } from '@/components/DailyClaimSection';
import { EggClicker } from '@/components/EggClicker';
import { REWARD_TIERS } from '@/constants/rewards';

export default function Home() {
  const { address, isConnected } = useAccount();
  const [isMounted, setIsMounted] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [farcasterUser, setFarcasterUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'rewards' | 'leaderboard' | 'profile'>('home');
  const [confirmClaimTier, setConfirmClaimTier] = useState<number | null>(null);
  const [selectedSeasonTab, setSelectedSeasonTab] = useState<'0' | 'all'>('0');

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText('https://1millionegg.xyz/');
    toast.success('Profile link copied!');
    setShowShareOptions(false);
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const queryClient = useQueryClient();

  // Auto-connect Farcaster wallet and prompt to add Frame
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        const context = await sdk.context;
        if (context?.user) setFarcasterUser(context.user);
        if (context?.client) {
          connect({ connector: farcasterFrame() });
          if (!context.client.added) sdk.actions.addFrame();
        }
      } catch (e) {
        console.error('Failed to init Farcaster:', e);
      }
    };
    initFarcaster();
  }, [connect]);

  // ── RPC Reads (time-sensitive values only) ────────────────────────────────
  // These four fields MUST come from the chain because:
  //   - eggBalance: changes immediately after any reward claim, drives button state
  //   - lastClaimTime: drives the countdown timer to the second
  //   - streakCount / brokenStreak: drive the daily claim UI state
  // Everything else (score, seasonEggs, season progress) comes from the DB via /api/v1/home.
  const { data: contractData, isLoading: isContractsLoading, refetch: refetchContracts } = useReadContracts({
    contracts: address
      ? [
          { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'eggBalances', args: [address as `0x${string}`] },
          { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'lastClaimTime', args: [address as `0x${string}`] },
          { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'streakCount', args: [address as `0x${string}`] },
          { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'brokenStreak', args: [address as `0x${string}`] },
        ]
      : [],
    query: { enabled: !!address },
  });

  const eggBalance = address && contractData?.[0]?.result !== undefined ? Number(contractData[0].result) : 0;
  const lastClaimTime = address && contractData?.[1]?.result !== undefined ? Number(contractData[1].result) : 0;
  const streakCount = address && contractData?.[2]?.result !== undefined ? Number(contractData[2].result) : 0;
  const brokenStreak = address && contractData?.[3]?.result !== undefined ? Number(contractData[3].result) : 0;

  // ── Home API: Global season data ──────────────────────────────────────────
  // Same for all users. Cached 60 s in Redis; refetch every 60 s client-side.
  const { data: homeGlobal, isLoading: isHomeGlobalLoading } = useQuery({
    queryKey: ['home-global'],
    queryFn: async () => {
      const res = await fetch('/api/v1/home');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data.global as {
        currentSeason: number;
        seasonTarget: number;
        seasonTotalEggs: number;
        totalPlayers: number;
      };
    },
    staleTime: 50_000,
    refetchInterval: 60_000,
  });

  // ── Home API: Per-user indexed data ───────────────────────────────────────
  // Ponder-indexed values. Acceptable to be a few blocks behind — stale is
  // clearly labelled in the source, and the user sees RPC values for real-time
  // fields above. Cache 15 s; invalidated after TX confirms.
  const { data: homeUser, isLoading: isHomeUserLoading } = useQuery({
    queryKey: ['home-user', address],
    queryFn: async () => {
      const res = await fetch(`/api/v1/home?address=${address}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data.player as {
        lifetimePoints: number;
        totalTaps: number;
        seasonEggs: number;
        totalSeasonEggs: number;
        seasonRank: number;
        allTimeRank: number;
      } | null;
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: !!address,
  });

  // Convenience aliases used throughout the JSX
  const currentSeason = homeGlobal?.currentSeason ?? 0;
  const seasonTarget = homeGlobal?.seasonTarget ?? 1_000_000;
  const seasonTotalEggs = homeGlobal?.seasonTotalEggs ?? 0;
  const score = homeUser?.lifetimePoints ?? 0;
  const seasonEggs = homeUser?.seasonEggs ?? 0;
  const isHomeLoading = isHomeGlobalLoading;
  const isUserStatsLoading = isContractsLoading || isHomeUserLoading;

  // ── Leaderboard (lazy: only fetch when the tab is open) ───────────────────
  // Avoids 4 HTTP requests + 4 Redis lookups every 30 s when the user never
  // visits the leaderboard tab.
  const { data: leaderboardData, isLoading: isLeaderboardLoading, error: leaderboardError } = useQuery({
    queryKey: ['leaderboard', selectedSeasonTab, address],
    queryFn: async () => {
      const type = selectedSeasonTab === '0' ? 'season' : 'all';
      const [topRes, playerRes] = await Promise.all([
        fetch(`/api/v1/leaderboard/top?type=${type}`),
        address ? fetch(`/api/v1/leaderboard/player/${address}`) : Promise.resolve(null),
      ]);

      const topJson = await topRes.json();
      const playerJson = playerRes ? await playerRes.json() : null;

      if (!topJson.success || !Array.isArray(topJson.data)) {
        throw new Error(topJson.error || 'Unexpected leaderboard format');
      }

      const playerInfo = playerJson?.success ? playerJson.data : null;

      return {
        topPlayers: topJson.data.map((p: any) => ({
          address: p.address,
          seasonEggs: p.seasonEggs || 0,
          totalSeasonEggs: p.totalSeasonEggs || 0,
          lifetimePoints: p.lifetimePoints || 0,
          totalTaps: p.totalTaps || 0,
          rank: Number(p.rank),
        })),
        yourRank: playerInfo
          ? {
              address: playerInfo.id || address,
              seasonEggs: playerInfo.seasonEggs || 0,
              totalSeasonEggs: playerInfo.totalSeasonEggs || 0,
              lifetimePoints: playerInfo.lifetimePoints || 0,
              totalTaps: playerInfo.totalTaps || 0,
              rank: Number(type === 'season' ? playerInfo.seasonRank : playerInfo.allTimeRank),
            }
          : undefined,
      };
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
    enabled: activeTab === 'leaderboard', // Only fetch when the tab is visible
  });

  const currentLeaderboard = leaderboardData?.topPlayers || [];
  const yourRankData = leaderboardData?.yourRank;

  // ── Contract Writes ────────────────────────────────────────────────────────
  const { data: hash, writeContract, writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess: isConfirmed, isLoading: isConfirming, error: receiptError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (writeError) {
      const msg = (writeError as any).shortMessage || writeError.message;
      toast.error(msg.includes('User rejected') ? 'Transaction cancelled' : `Transaction failed: ${msg}`);
    }
    if (receiptError) {
      toast.error('Transaction failed on network');
    }
  }, [writeError, receiptError]);

  useEffect(() => {
    if (!isConfirmed) return;
    toast.success('Transaction Confirmed! 🎉');

    // RPC values (eggBalance, streak) — refetch immediately
    refetchContracts();

    // DB-backed values — Ponder needs a few seconds to index the block
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['home-user', address] });
      queryClient.invalidateQueries({ queryKey: ['home-global'] });
    }, 3000);

    // Leaderboard rankings take a bit longer to propagate
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    }, 5000);
  }, [isConfirmed, refetchContracts, queryClient, address]);

  // ── Transaction handlers ───────────────────────────────────────────────────
  // Debug logging and extra getBalance / getChainId RPC calls have been
  // removed — they were only useful during development.
  const handleTap = useCallback(async () => {
    if (!isConnected) { toast.error('Please connect your wallet first!'); return; }
    if (isPending || isConfirming) { toast('Transaction in progress, please wait...', { icon: '⏳' }); return; }
    window.navigator?.vibrate?.(50);
    toast('Sent to wallet, awaiting approval...', { icon: '🚀' });
    try {
      await writeContractAsync({
        chainId: 8453,
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'tap',
        value: parseEther('0.0000055'),
        gas: BigInt(200000),
      });
    } catch (error: any) {
      const msg = error?.shortMessage || error?.message || '';
      if (!msg.includes('User rejected')) {
        console.error('Tap transaction error:', msg);
        if (msg.includes('gasLimit') || msg.includes('funds') || msg.includes('null')) {
          toast.error('Failed: Insufficient ETH for gas on Base network.', { duration: 5000 });
        } else {
          toast.error('Transaction Failed. See console.');
        }
      }
    }
  }, [isConnected, isPending, isConfirming, writeContractAsync]);

  const handleClaimClick = useCallback((tier: number) => {
    if (!isConnected) { toast.error('Please connect your wallet first!'); return; }
    setConfirmClaimTier(tier);
  }, [isConnected]);

  const confirmClaim = useCallback(() => {
    if (confirmClaimTier === null) return;
    toast('Claim transaction sent...', { icon: '💰' });
    writeContract(
      {
        chainId: 8453,
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'claimReward',
        args: [confirmClaimTier],
        gas: BigInt(200000),
      },
      { 
        onSuccess: () => toast.success('✨ Reward Claimed Successfully!'),
        onError: (error: any) => {
          const msg = error?.shortMessage || error?.message || '';
          if (!msg.includes('User rejected')) {
            if (msg.includes('gasLimit') || msg.includes('funds') || msg.includes('null')) {
              toast.error('Failed: Insufficient ETH for gas on Base network.');
            } else {
              toast.error('Transaction Failed.');
            }
          }
        }
      }
    );
    setConfirmClaimTier(null);
  }, [confirmClaimTier, writeContract]);

  const handleDailyClaim = useCallback(() => {
    if (!isConnected) { toast.error('Please connect your wallet first!'); return; }
    toast('Daily Claim sent...', { icon: '🔥' });
    writeContract(
      {
        chainId: 8453,
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'dailyClaim',
        value: parseEther('0.000070'),
        gas: BigInt(200000),
      },
      { 
        onSuccess: () => toast.success(`✨ Day ${streakCount === 0 ? 1 : streakCount + 1} Claimed! +10 Eggs`),
        onError: (error: any) => {
          const msg = error?.shortMessage || error?.message || '';
          if (!msg.includes('User rejected')) {
            if (msg.includes('gasLimit') || msg.includes('funds') || msg.includes('null')) {
              toast.error('Failed: Insufficient ETH for gas on Base network.');
            } else {
              toast.error('Transaction Failed.');
            }
          }
        }
      }
    );
  }, [isConnected, writeContract, streakCount]);

  const handleRestoreStreak = useCallback(() => {
    if (!isConnected) { toast.error('Please connect your wallet first!'); return; }
    toast('Restoring Streak...', { icon: '❤️‍🩹' });
    writeContract(
      {
        chainId: 8453,
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'restoreStreak',
        value: parseEther('0.000070'),
        gas: BigInt(200000),
      },
      {
        onError: (error: any) => {
          const msg = error?.shortMessage || error?.message || '';
          if (!msg.includes('User rejected')) {
            if (msg.includes('gasLimit') || msg.includes('funds') || msg.includes('null')) {
              toast.error('Failed: Insufficient ETH for gas on Base network.');
            } else {
              toast.error('Transaction Failed.');
            }
          }
        }
      }
    );
  }, [isConnected, writeContract]);

  if (!isMounted) return null;

  if (!isConnected) {
    return (
      <div className="v0-landing dark fixed inset-0 w-full h-full overflow-y-auto overflow-x-hidden selection:bg-primary/20 bg-background">
        <LandingPage />
      </div>
    );
  }

  return (
    <main className="container" style={{ paddingBottom: '90px' }}>
      <Toaster position="top-center" toastOptions={{ style: { background: '#333', color: '#fff' } }} />

      {/* Header (Always Visible) */}
      <header className="header">
        <div className="header-title">
          <h1>1 Million Egg</h1>
        </div>
        <div>
          <ConnectButton showBalance={false} chainStatus="none" />
        </div>
      </header>

      {/* --- HOME TAB --- */}
      {activeTab === 'home' && (
        <div className="tab-content animate-slide-up flex flex-col gap-6">

          {/* Season Progress Bar */}
          <section className="relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.02] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.03]">
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-[80px]" />
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center justify-between">
                {isHomeLoading ? (
                  <div className="h-6 w-24 animate-pulse rounded-md bg-white/10" />
                ) : (
                  <h2 className="text-xl font-semibold tracking-tight text-white">Season {currentSeason}</h2>
                )}
                {isHomeLoading ? (
                  <div className="h-6 w-32 animate-pulse rounded-full bg-white/10" />
                ) : (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]">
                    REMAINING: {(seasonTarget - seasonTotalEggs).toLocaleString('en-US')}
                  </span>
                )}
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/40 shadow-inner">
                {isHomeLoading ? (
                  <div className="h-full w-full animate-pulse bg-white/5" />
                ) : (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-1000 ease-out"
                    style={{
                      width: `${Math.min(100, (seasonTotalEggs / seasonTarget) * 100)}%`,
                      boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
                    }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%] animate-shimmer" />
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xs font-medium text-zinc-400">
                {isHomeLoading ? (
                  <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                ) : (
                  <span className="tabular-nums tracking-tight">
                    {seasonTotalEggs.toLocaleString('en-US')} / {seasonTarget.toLocaleString('en-US')} Eggs
                  </span>
                )}
                {isHomeLoading ? (
                  <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                ) : (
                  <span className="tabular-nums tracking-tight">
                    {Math.max(0, seasonTarget - seasonTotalEggs).toLocaleString('en-US')} left
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Stats Cards */}
          <div className="grid w-full max-w-md grid-cols-2 gap-4 mx-auto">
            <section className="relative overflow-hidden rounded-[20px] border border-white/5 bg-white/[0.02] p-5 text-center shadow-lg backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 hover:bg-white/[0.04]">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-zinc-500">Your Score</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-white tabular-nums">
                {isUserStatsLoading ? (
                  <div className="mx-auto h-8 w-20 animate-pulse rounded bg-white/10" />
                ) : (
                  score.toLocaleString('en-US')
                )}
              </div>
              <div className="mt-1 text-[0.65rem] font-medium text-zinc-600">Lifetime Taps</div>
            </section>

            <section className="relative overflow-hidden rounded-[20px] border border-primary/10 bg-primary/[0.02] p-5 text-center shadow-[0_8px_20px_rgba(245,158,11,0.05)] backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 hover:bg-primary/[0.04]">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-primary">Your Eggs</div>
              <div className="mt-2 flex items-center justify-center gap-1 text-2xl font-bold tracking-tight text-white tabular-nums">
                {isUserStatsLoading ? (
                  <div className="mx-auto h-8 w-20 animate-pulse rounded bg-white/10" />
                ) : (
                  <>
                    {eggBalance.toLocaleString('en-US')} <span className="text-xl">🥚</span>
                  </>
                )}
              </div>
              <div className="mt-1 text-[0.65rem] font-medium text-primary/60">Available to Spend</div>
            </section>
          </div>

          {/* Season Eggs Pill */}
          <div className="flex justify-center">
            <div
              className="group relative inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-5 py-2.5 shadow-[0_4px_20px_rgba(245,158,11,0.15)] backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-primary/40 hover:bg-primary/20 hover:shadow-[0_8px_30px_rgba(245,158,11,0.25)] cursor-help"
              title="Eggs you keep during this season may be used for future ecosystem rewards. Spending Eggs through Rewards will also reduce your Season Egg balance."
            >
              <span className="text-xl transition-transform duration-300 group-hover:scale-110">🔥</span>
              <div className="flex flex-col text-left">
                <span className="text-[0.65rem] font-bold uppercase tracking-widest text-primary">Season Eggs</span>
                <span className="text-base font-extrabold tabular-nums text-white">
                  {isUserStatsLoading ? (
                    <div className="mt-0.5 h-5 w-16 animate-pulse rounded bg-white/20" />
                  ) : (
                    seasonEggs.toLocaleString('en-US')
                  )}
                </span>
                <span className="mt-0.5 text-[0.6rem] font-medium text-primary/60">Eligible for future rewards</span>
              </div>
              <span className="ml-1 text-lg text-primary/40 transition-colors duration-300 group-hover:text-primary/80">ⓘ</span>
            </div>
          </div>

          {/* Egg Clicker — animation state lives inside EggClicker */}
          <EggClicker
            isPending={isPending}
            isConfirming={isConfirming}
            isConnected={isConnected}
            onTap={handleTap}
          />

          {/* Daily Claim — timer state lives inside DailyClaimSection */}
          <DailyClaimSection
            lastClaimTime={lastClaimTime}
            streakCount={streakCount}
            brokenStreak={brokenStreak}
            isLoading={isContractsLoading}
            onDailyClaim={handleDailyClaim}
            onRestoreStreak={handleRestoreStreak}
          />
        </div>
      )}

      {/* --- LEADERBOARD TAB --- */}
      {activeTab === 'leaderboard' && (
        <div className="tab-content animate-slide-up" style={{ paddingBottom: '160px' }}>

          {/* Season Selector */}
          <div style={{ display: 'flex', background: '#1a1d24', padding: '4px', borderRadius: '12px', border: '1px solid #2e3340', marginBottom: '16px' }}>
            {(['0', 'all'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSelectedSeasonTab(tab)}
                style={{
                  flex: 1, padding: '8px 0', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', borderRadius: '8px',
                  background: selectedSeasonTab === tab ? '#2e3340' : 'transparent',
                  color: selectedSeasonTab === tab ? '#fff' : '#9ca3af',
                  transition: 'all 0.2s', cursor: 'pointer',
                }}
              >
                {tab === 'all' ? 'All Time' : `Season ${tab}`}
              </button>
            ))}
          </div>

          <section className="glass-panel">
            <div className="leaderboard-header">
              <div className="title">GLOBAL LEADERBOARD</div>
              <a href="#" className="top-link">TOP 20 <span>›</span></a>
            </div>

            <div className="leaderboard-list">
              {leaderboardError ? (
                <div style={{ color: '#ef4444', textAlign: 'center', padding: '10px' }}>
                  Error: {leaderboardError.message}
                </div>
              ) : isLeaderboardLoading ? (
                <div style={{ color: '#9ca3af', textAlign: 'center', padding: '10px' }}>
                  Loading leaderboard...
                </div>
              ) : currentLeaderboard.length === 0 ? (
                <div style={{ color: '#9ca3af', textAlign: 'center', padding: '10px' }}>No data yet!</div>
              ) : (
                currentLeaderboard.map((entry: any, index: number) => {
                  let badge = null;
                  if (index === 0) badge = <span style={{ filter: 'drop-shadow(0 0 6px rgba(255, 215, 0, 0.8))' }}>🥇</span>;
                  else if (index === 1) badge = <span style={{ filter: 'drop-shadow(0 0 6px rgba(192, 192, 192, 0.8))' }}>🥈</span>;
                  else if (index === 2) badge = <span style={{ filter: 'drop-shadow(0 0 6px rgba(205, 127, 50, 0.8))' }}>🥉</span>;

                  return (
                    <div key={index} className={`leaderboard-item ${entry.address === address?.toLowerCase() ? 'current-user' : ''}`}>
                      <div className="rank-info">
                        <span className="rank" style={{ fontSize: badge ? '1.2rem' : '1rem' }}>{badge || index + 1}</span>
                        <span className="name">{entry.address.slice(0, 6)}...{entry.address.slice(-4)}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <div className="score" style={{ fontSize: '1rem' }}>
                          {selectedSeasonTab === 'all'
                            ? entry.lifetimePoints.toLocaleString('en-US')
                            : entry.seasonEggs.toLocaleString('en-US')}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                          {selectedSeasonTab === 'all'
                            ? `${(entry.totalSeasonEggs || 0).toLocaleString('en-US')} Eggs`
                            : `${entry.lifetimePoints.toLocaleString('en-US')} TP`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Sticky Your Rank Bar */}
          <div style={{
            position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
            width: '100%', maxWidth: '448px', padding: '0 16px', zIndex: 90,
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #1f232b 0%, #2e3340 100%)',
              border: '1px solid #f59e0b', borderRadius: '16px', padding: '12px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#f59e0b' }}>
                  #{yourRankData?.rank || '--'}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 'bold', color: '#fff' }}>You</span>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Season {selectedSeasonTab}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {selectedSeasonTab === 'all'
                    ? (yourRankData?.lifetimePoints?.toLocaleString('en-US') || 0)
                    : (yourRankData?.seasonEggs?.toLocaleString('en-US') || 0)}
                  <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
                    {selectedSeasonTab === 'all' ? 'TP' : 'Eggs'}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '500' }}>
                  {selectedSeasonTab === 'all'
                    ? `${(yourRankData?.totalSeasonEggs || 0).toLocaleString('en-US')} Eggs`
                    : `${(yourRankData?.lifetimePoints || 0).toLocaleString('en-US')} TP`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- REWARDS TAB --- */}
      {activeTab === 'rewards' && (
        <div className="tab-content animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Next Reward Mini-Card */}
          {(() => {
            const nextReward = REWARD_TIERS.find(r => r.eggs > eggBalance);
            if (!nextReward) return null;
            return (
              <section className="glass-panel" style={{ padding: '16px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(0,0,0,0) 100%)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: '800', textTransform: 'uppercase' }}>Next Reward</span>
                    <span style={{ fontSize: '1rem', color: '#fff', fontWeight: '600' }}>{nextReward.eggs - eggBalance} Eggs Left</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#9ca3af' }}>→</span>
                    <span style={{ color: '#22c55e', fontWeight: '800', fontSize: '1.2rem' }}>${nextReward.usdc.toFixed(2)} USDC</span>
                  </div>
                </div>
              </section>
            );
          })()}

          <section className="glass-panel">
            <div className="leaderboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="title text-gold">USDC REWARDS 💰</div>
              <div style={{ background: '#1a1c1e', padding: '6px 12px', borderRadius: '12px', border: '1px solid #333', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Balance: <span style={{ color: '#f59e0b' }}>{eggBalance.toLocaleString()} 🥚</span>
              </div>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center', marginTop: '1rem' }}>
              Exchange your collected eggs for real USDC! (Base Network)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {REWARD_TIERS.map(reward => (
                <div key={reward.tier} className="leaderboard-item" style={{ padding: '0.75rem 1rem' }}>
                  <div className="rank-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="text-gold" style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{reward.eggs} 🥚</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="score" style={{ color: '#22c55e' }}>${reward.usdc.toFixed(2)} USDC</div>
                    <button
                      onClick={() => handleClaimClick(reward.tier)}
                      style={{
                        background: eggBalance >= reward.eggs ? '#f59e0b' : '#374151',
                        color: eggBalance >= reward.eggs ? '#000' : '#9ca3af',
                        border: 'none', padding: '0.5rem 1rem', borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: eggBalance >= reward.eggs ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s',
                      }}
                      disabled={eggBalance < reward.eggs}
                    >
                      CLAIM
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* --- PROFILE TAB --- */}
      {activeTab === 'profile' && (
        <div className="tab-content fade-in">
          <div style={{ background: '#0a0a0c', border: '1px solid #1f232b', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
            {/* Avatar & Name */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
              <img
                src={farcasterUser?.pfpUrl || 'https://i.imgur.com/vH1NpwQ.png'}
                alt="Avatar"
                style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover', background: '#22262f' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
                  {farcasterUser?.displayName || 'Egg Clicker Player'}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                  @{farcasterUser?.username || 'anonymous'}
                </div>
              </div>
            </div>

            {/* Wallet Address */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '14px', marginBottom: '24px', background: '#13151a', padding: '12px 16px', borderRadius: '12px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 15h0M2 9.5h20" /></svg>
              <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
            </div>

            {/* Profile Stats — uses homeUser data; no extra RPC needed */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
              <div style={{ background: '#13151a', padding: '16px', borderRadius: '12px', border: '1px solid #1f232b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>Season Eggs</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f59e0b' }}>{seasonEggs.toLocaleString()}</span>
              </div>
              <div style={{ background: '#13151a', padding: '16px', borderRadius: '12px', border: '1px solid #1f232b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>Season Rank</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>#{homeUser?.seasonRank || '--'}</span>
              </div>
              <div style={{ background: '#13151a', padding: '16px', borderRadius: '12px', border: '1px solid #1f232b', display: 'flex', flexDirection: 'column', alignItems: 'center', gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>Lifetime Taps</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#fff' }}>{score.toLocaleString()}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="relative w-full">
                <button
                  onClick={() => setShowShareOptions(!showShareOptions)}
                  className="btn-active-scale"
                  style={{
                    width: '100%', padding: '14px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    color: '#fff', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center',
                    gap: '8px', fontWeight: 'bold', border: 'none',
                    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)', cursor: 'pointer',
                  }}
                >
                  <Share2 size={16} />
                  Share Profile
                </button>

                {showShareOptions && (
                  <div className="absolute bottom-[110%] left-0 flex w-full flex-col gap-1 rounded-2xl border border-white/10 bg-[#0f1115]/95 p-2 shadow-2xl backdrop-blur-xl z-50">
                    <a
                      href={`https://x.com/intent/tweet?text=${encodeURIComponent('🥚 Tap the Egg. Earn Real USDC.\n\nhttps://1millionegg.xyz/')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowShareOptions(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Share on X
                    </a>
                    <a
                      href={`https://warpcast.com/~/compose?text=${encodeURIComponent('🥚 Tap the Egg. Earn Real USDC on Base.\n\nPlay the 1 Million Egg Mini App now!')}&embeds[]=${encodeURIComponent('https://farcaster.xyz/miniapps/0wCsGfEbFiQQ/1-million-egg')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShowShareOptions(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <div className="flex h-4 w-4 items-center justify-center rounded bg-[#855DCD] text-[10px] font-bold text-white">F</div>
                      Share on Farcaster
                    </a>
                    <button
                      onClick={handleCopyLink}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      <Copy size={16} className="text-zinc-400" />
                      Copy Link
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => disconnect()}
                style={{
                  width: '100%', padding: '14px', background: 'transparent',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center',
                  gap: '8px', fontWeight: 'bold',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Disconnect Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          </div>
          <span>Home</span>
        </button>
        <button className={`nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
          </div>
          <span>Ranking</span>
        </button>
        <button className={`nav-item ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => setActiveTab('rewards')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
          </div>
          <span>Rewards</span>
        </button>
        <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </div>
          <span>Profile</span>
        </button>
      </nav>

      {/* Confirmation Modal */}
      {confirmClaimTier !== null && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}
          onClick={() => setConfirmClaimTier(null)}
        >
          <div
            className="animate-slide-up"
            style={{ background: '#1a1d24', border: '1px solid rgba(245, 158, 11, 0.5)', borderRadius: '24px', padding: '24px', width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ textAlign: 'center', margin: 0, fontSize: '1.2rem', color: '#fff' }}>Confirm Claim 🥚</h3>
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem', lineHeight: '1.5' }}>
              You are about to spend{' '}
              <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                {REWARD_TIERS.find(r => r.tier === confirmClaimTier)?.eggs} Eggs
              </span>
              .<br /><br />
              These Eggs will also be removed from your Season Egg balance.
              <br /><br />
              Do you want to continue?
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => setConfirmClaimTier(null)}
                style={{ flex: 1, padding: '12px', background: '#2e3340', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                className="btn-active-scale"
              >
                Cancel
              </button>
              <button
                onClick={confirmClaim}
                style={{ flex: 1, padding: '12px', background: 'linear-gradient(180deg, #fcd34d 0%, #f59e0b 100%)', color: '#000', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                className="btn-active-scale"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
