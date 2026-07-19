'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Share2, Copy } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useConnect, useDisconnect } from 'wagmi';
import { parseEther } from 'viem';
import toast, { Toaster } from 'react-hot-toast';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';
import sdk from '@farcaster/frame-sdk';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LandingPage } from '@/components/landing/LandingPage';

interface FloatingText {
  id: number;
  x: number;
  y: number;
}

import { REWARD_TIERS } from '@/constants/rewards';

export default function Home() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const [isMounted, setIsMounted] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);

  const handleCopyLink = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(`https://1millionegg.xyz/player/${address}`);
    toast.success("Profile link copied!");
    setShowShareOptions(false);
  }, [address]);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [isClicked, setIsClicked] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [textIdCounter, setTextIdCounter] = useState(0);
  const [farcasterUser, setFarcasterUser] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<'home' | 'rewards' | 'leaderboard' | 'profile'>('home');
  const [confirmClaimTier, setConfirmClaimTier] = useState<number | null>(null);

  // Notify Farcaster Frame v2 that the app has finished loading to dismiss the splash screen
  // Auto-connect Farcaster wallet, and prompt to add Frame
  useEffect(() => {
    const initFarcaster = async () => {
      try {
        await sdk.actions.ready();

        // Prompt to Add Mini App if not added
        const context = await sdk.context;
        if (context?.user) {
          setFarcasterUser(context.user);
        }
        
        if (context?.client) {
          // If we are inside Farcaster, forcefully trigger the connection approval
          // If already approved, it silently connects. If not, Farcaster shows the approval modal.
          connect({ connector: farcasterFrame() });

          if (!context.client.added) {
            sdk.actions.addFrame();
          }
        }
      } catch (e) {
        console.error("Failed to call farcaster ready:", e);
      }
    };
    initFarcaster();
  }, [connect]);

  // Contract Reads
  const queryClient = useQueryClient();

  // Contract Reads using Multicall
  const { data: contractData, refetch: refetchContracts, isLoading: isContractsLoading } = useReadContracts({
    contracts: [
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'currentSeason' },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'globalScore' },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'seasonTarget' },
      { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'seasonTotalEggs' },
      // Address dependent reads
      ...(address ? [
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'scores', args: [address as `0x${string}`] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'eggBalances', args: [address as `0x${string}`] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'lastClaimTime', args: [address as `0x${string}`] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'streakCount', args: [address as `0x${string}`] },
        { address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'brokenStreak', args: [address as `0x${string}`] }
      ] : [])
    ]
  });

  const currentSeason = contractData?.[0]?.result ? Number(contractData[0].result) : 0;
  const globalScore = contractData?.[1]?.result ? Number(contractData[1].result) : 0;
  const seasonTarget = contractData?.[2]?.result ? Number(contractData[2].result) : 1000000;
  const seasonTotalEggs = contractData?.[3]?.result ? Number(contractData[3].result) : 0;

  const score = address && contractData?.[4]?.result !== undefined ? Number(contractData[4].result) : 0;
  const eggBalance = address && contractData?.[5]?.result !== undefined ? Number(contractData[5].result) : 0;
  const lastClaimTime = address && contractData?.[6]?.result !== undefined ? Number(contractData[6].result) : 0;
  const streakCount = address && contractData?.[7]?.result !== undefined ? Number(contractData[7].result) : 0;
  const brokenStreak = address && contractData?.[8]?.result !== undefined ? Number(contractData[8].result) : 0;

  // We need a separate useReadContract for seasonEggs because it depends on currentSeason which is dynamic
  const { data: seasonEggsData, refetch: refetchSeasonEggs } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'seasonEggs',
    args: [BigInt(currentSeason), address as `0x${string}`],
    query: { enabled: !!address }
  });
  const seasonEggs = seasonEggsData ? Number(seasonEggsData) : 0;

  const [selectedSeasonTab, setSelectedSeasonTab] = useState<'0' | 'all'>('0');

  const { data: leaderboardData, isLoading: isLeaderboardLoading, error: leaderboardError, refetch: refetchLeaderboard } = useQuery({
    queryKey: ['leaderboard', selectedSeasonTab, address],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?season=${selectedSeasonTab}${address ? `&user=${address}` : ''}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch leaderboard');
      }
      return res.json();
    },
    refetchInterval: 10000,
  });

  const currentLeaderboard = leaderboardData?.topPlayers || [];
  const yourRankData = leaderboardData?.yourRank;

  const { data: hash, writeContract, isPending, isSuccess, error: writeError } = useWriteContract();

  // Watch for transaction success to trigger a refetch
  const { isSuccess: isConfirmed, isLoading: isConfirming, error: receiptError } = useWaitForTransactionReceipt({
    hash, // Now tracking the actual transaction hash
  });

  // Handle transaction errors
  useEffect(() => {
    if (writeError) {
      // @ts-ignore - viem errors have shortMessage
      const msg = writeError.shortMessage || writeError.message;
      if (msg.includes('User rejected')) {
        toast.error('Transaction cancelled by user');
      } else {
        toast.error(`Transaction failed: ${msg}`);
      }
    }
    if (receiptError) {
      toast.error('Transaction failed on network');
    }
  }, [writeError, receiptError]);

  // Re-fetch scores whenever a transaction succeeds
  useEffect(() => {
    if (isConfirmed) {
      toast.success('Transaction Confirmed! 🎉');
      // Small delay allows the RPC nodes to sync the latest state after block confirmation
      setTimeout(() => {
        refetchContracts();
        refetchSeasonEggs();
      }, 2000);
      
      // Slightly longer delay for backend leaderboard indexing
      setTimeout(() => {
        refetchLeaderboard();
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      }, 3000);
    }
  }, [isConfirmed, refetchContracts, refetchSeasonEggs, refetchLeaderboard, queryClient]);

  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<string | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = Math.floor(Date.now() / 1000);
      
      if (lastClaimTime === 0) {
        setCanClaim(true);
        setIsBroken(false);
        setTimeUntilNextClaim(null);
        return;
      }
      
      const nextClaimAvailable = lastClaimTime + (24 * 60 * 60);
      const streakBreaksAt = lastClaimTime + (48 * 60 * 60);

      if (now >= streakBreaksAt) {
        setIsBroken(true);
        setCanClaim(false);
        setTimeUntilNextClaim(null);
      } else if (now >= nextClaimAvailable) {
        setCanClaim(true);
        setIsBroken(false);
        setTimeUntilNextClaim(null);
      } else {
        setCanClaim(false);
        setIsBroken(false);
        const diff = nextClaimAvailable - now;
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        setTimeUntilNextClaim(`${hours}h ${mins}m ${secs}s`);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lastClaimTime]);

  const handleTap = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }

    if (isPending || isConfirming) {
      toast('Transaction in progress, please wait...', { icon: '⏳' });
      return;
    }

    // Vibrate if supported
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 100);

    // Call the smart contract
    toast('Sent to wallet, awaiting approval...', { icon: '🚀' });
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'tap',
      value: parseEther('0.0000055'),
    });

    // Add floating text
    let x = 50;
    let y = 50;
    
    if (e && 'clientX' in e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      x = ((e.clientX - rect.left) / rect.width) * 100;
      y = ((e.clientY - rect.top) / rect.height) * 100;
    } else if (e && 'touches' in e) {
       const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
       x = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
       y = ((e.touches[0].clientY - rect.top) / rect.height) * 100;
    }

    const newId = Date.now() + Math.random();
    setFloatingTexts(prev => [...prev, { id: newId, x, y }]);

    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(text => text.id !== newId));
    }, 800);
  }, [isConnected, isPending, isConfirming, writeContract]);

  const handleClaimClick = useCallback((tier: number) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }
    setConfirmClaimTier(tier);
  }, [isConnected]);

  const confirmClaim = useCallback(() => {
    if (confirmClaimTier === null) return;
    toast('Claim transaction sent...', { icon: '💰' });
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'claimReward',
      args: [confirmClaimTier],
    }, {
      onSuccess: () => {
        toast.success(`✨ Reward Claimed Successfully!`);
      }
    });
    setConfirmClaimTier(null);
  }, [confirmClaimTier, writeContract]);

  const handleDailyClaim = useCallback(() => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }
    toast('Daily Claim sent...', { icon: '🔥' });
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'dailyClaim',
      value: parseEther('0.000070'),
    }, {
      onSuccess: () => {
        toast.success(`✨ Day ${streakCount === 0 ? 1 : streakCount + 1} Claimed! +10 Eggs`);
      }
    });
  }, [isConnected, writeContract, streakCount]);

  const handleRestoreStreak = useCallback(() => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }
    toast('Restoring Streak...', { icon: '❤️‍🩹' });
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'restoreStreak',
      value: parseEther('0.000070'),
    });
  }, [isConnected, writeContract]);
  // Removed mockLeaderboards

  if (!isMounted) {
    return null; // Prevent hydration mismatch
  }

  if (!isConnected) {
    return (
      <div className="v0-landing dark fixed inset-0 w-full h-full overflow-y-auto overflow-x-hidden selection:bg-primary/20 bg-background">
        <LandingPage />
      </div>
    );
  }
  return (
    <main className="container" style={{ paddingBottom: '90px' }}>
      <Toaster position="top-center" toastOptions={{
        style: {
          background: '#333',
          color: '#fff',
        },
      }} />

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
            {/* Soft background glow */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/20 blur-[80px]" />
            
            <div className="relative flex flex-col gap-4">
              <div className="flex items-center justify-between">
                {isContractsLoading ? (
                  <div className="h-6 w-24 animate-pulse rounded-md bg-white/10" />
                ) : (
                  <h2 className="text-xl font-semibold tracking-tight text-white">Season {currentSeason}</h2>
                )}
                
                {isContractsLoading ? (
                  <div className="h-6 w-32 animate-pulse rounded-full bg-white/10" />
                ) : (
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary shadow-[inset_0_0_12px_rgba(245,158,11,0.1)]">
                    REMAINING: {(seasonTarget - seasonTotalEggs).toLocaleString('en-US')}
                  </span>
                )}
              </div>
              
              {/* Progress Bar Container */}
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/40 shadow-inner">
                {isContractsLoading ? (
                  <div className="h-full w-full animate-pulse bg-white/5" />
                ) : (
                  <div 
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-1000 ease-out"
                    style={{ 
                      width: `${Math.min(100, (seasonTotalEggs / seasonTarget) * 100)}%`,
                      boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)'
                    }}
                  >
                    {/* Shimmer effect inside progress bar */}
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%] animate-shimmer" />
                  </div>
                )}
              </div>
              
              <div className="flex justify-between text-xs font-medium text-zinc-400">
                {isContractsLoading ? (
                  <div className="h-4 w-20 animate-pulse rounded bg-white/10" />
                ) : (
                  <span className="tabular-nums tracking-tight">{seasonTotalEggs.toLocaleString('en-US')} / {seasonTarget.toLocaleString('en-US')} Eggs</span>
                )}
                
                {isContractsLoading ? (
                  <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
                ) : (
                  <span className="tabular-nums tracking-tight">{Math.max(0, seasonTarget - seasonTotalEggs).toLocaleString('en-US')} left</span>
                )}
              </div>
            </div>
          </section>

          {/* Stats Header Area */}
          <div className="grid w-full max-w-md grid-cols-2 gap-4 mx-auto">
            <section className="relative overflow-hidden rounded-[20px] border border-white/5 bg-white/[0.02] p-5 text-center shadow-lg backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 hover:bg-white/[0.04]">
              <div className="text-[0.7rem] font-bold uppercase tracking-wider text-zinc-500">Your Score</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-white tabular-nums">
                {isContractsLoading ? (
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
                {isContractsLoading ? (
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
          
          {/* Season Eggs Indicator */}
          <div className="flex justify-center">
            <div 
              className="group relative inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-5 py-2.5 shadow-[0_4px_20px_rgba(245,158,11,0.15)] backdrop-blur-md transition-all duration-300 hover:scale-[1.02] hover:border-primary/40 hover:bg-primary/20 hover:shadow-[0_8px_30px_rgba(245,158,11,0.25)] cursor-help"
              title="Eggs you keep during this season may be used for future ecosystem rewards. Spending Eggs through Rewards will also reduce your Season Egg balance."
            >
              <span className="text-xl transition-transform duration-300 group-hover:scale-110">🔥</span>
              <div className="flex flex-col text-left">
                <span className="text-[0.65rem] font-bold uppercase tracking-widest text-primary">Season Eggs</span>
                <span className="text-base font-extrabold tabular-nums text-white">
                  {isContractsLoading ? (
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

          {/* Egg Clicker Area */}
          <section className="egg-container">
            <div 
              className={`egg-wrapper ${isClicked ? 'clicked' : ''}`}
              onClick={handleTap}
            >
              <div className="egg-glow"></div>
              <Image 
                src="/egg.png" 
                alt="1 Million Egg" 
                width={280} 
                height={280} 
                className="egg-image"
                priority
              />
              {floatingTexts.map(text => (
                <div 
                  key={text.id} 
                  className="floating-text-fast"
                  style={{ left: `${text.x}%`, top: `${text.y}%` }}
                >
                  +1
                </div>
              ))}
            </div>
            <div className="px-5 w-full max-w-sm mx-auto">
              <button 
                className="group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-b from-amber-400 to-amber-600 p-4 text-black shadow-[0_8px_30px_rgba(245,158,11,0.4)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(245,158,11,0.5)] active:scale-95 active:shadow-[0_4px_15px_rgba(245,158,11,0.3)]"
                onClick={handleTap}
              >
                {/* Button Inner Glow */}
                <div className="absolute inset-0 rounded-[24px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]" />
                
                <div className="relative flex flex-col items-center gap-1">
                  <div className="text-[1.15rem] font-black tracking-wide">TAP THE EGG</div>
                  <div className="flex items-center gap-1.5 text-lg font-bold opacity-90">
                    +1 <span className="text-xl">🥚</span>
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* Daily Claim Section */}
          <section className="px-5 mb-8">
            <div className="relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.03]">
              {/* Soft background glow */}
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-primary/10 blur-[60px]" />
              
              <div className="relative flex flex-col gap-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="text-left">
                    <h3 className="text-sm font-black tracking-widest text-white uppercase drop-shadow-md">DAILY CLAIM</h3>
                    <p className="mt-0.5 text-xs font-medium text-zinc-400">Claim eggs every day!</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                    <span className="text-lg">🔥</span>
                    <div className="flex flex-col text-left">
                      {isContractsLoading ? (
                        <div className="h-3 w-12 animate-pulse rounded bg-white/20 mb-0.5" />
                      ) : (
                        <span className="text-[0.7rem] font-extrabold leading-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Day {streakCount === 0 ? 1 : streakCount}</span>
                      )}
                      <span className="text-[0.6rem] font-bold tracking-wider uppercase leading-tight text-primary/80">Streak</span>
                    </div>
                  </div>
                </div>

                {/* Days Grid (Dynamic 7-day pages) */}
                <div className="flex justify-between gap-1 border-b border-white/5 pb-5 mt-2">
                  {(() => {
                     const cycleDay = streakCount % 30 || (streakCount === 0 ? 1 : 30);
                     
                     let startDay = 1;
                     if (cycleDay <= 7) startDay = 1;
                     else if (cycleDay <= 14) startDay = 8;
                     else if (cycleDay <= 21) startDay = 15;
                     else if (cycleDay <= 28) startDay = 22;
                     else startDay = 24; // Covers 24-30

                     return Array.from({length: 7}, (_, i) => startDay + i).map(day => {
                       const isToday = cycleDay === day || (streakCount === 0 && day === 1);
                       const isPast = cycleDay > day;
                       const isClaimed = isPast || (isToday && !canClaim);
                       const isSpecial = day === 7 || day === 14 || day === 30;
                       const rewardAmount = (day === 7 || day === 14) ? 20 : (day === 30 ? 30 : 10);
                       
                       return (
                         <div 
                           key={day} 
                           className={`group relative flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border py-2.5 transition-all duration-500 ${
                             isToday && canClaim 
                              ? 'scale-[1.08] z-10 border-primary/60 bg-primary/20 shadow-[0_0_25px_rgba(245,158,11,0.4)] ring-1 ring-primary/50' 
                              : isToday && !canClaim
                                ? 'scale-[1.02] border-amber-300/40 bg-gradient-to-b from-amber-400/20 to-amber-600/10 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                                : isSpecial
                                  ? 'border-primary/20 bg-white/[0.02]'
                                  : 'border-white/5 bg-black/20'
                           } ${isPast && !isClaimed ? 'opacity-30 grayscale' : 'opacity-100'}`}
                         >
                           <div className={`text-[0.65rem] font-black tracking-wide ${isToday || isSpecial ? 'text-primary drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'text-zinc-500'}`}>Day {day}</div>
                           
                           {/* Reward Icon / Checkmark */}
                           <div className="relative flex items-center justify-center h-5 w-5 mt-0.5">
                             {isContractsLoading ? (
                               <div className="h-4 w-4 animate-pulse rounded-full bg-white/10" />
                             ) : isClaimed ? (
                               <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[0.6rem] font-black text-black shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-in zoom-in duration-500">✓</div>
                             ) : (
                               <div className={`text-[0.8rem] transition-all duration-300 ${isPast ? 'grayscale opacity-40' : 'opacity-90'} ${isToday && canClaim ? 'animate-pulse scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''}`}>🥚</div>
                             )}
                           </div>
                           
                           {/* Reward Amount */}
                           {isContractsLoading ? (
                             <div className="h-3 w-8 animate-pulse rounded bg-white/10 mt-0.5" />
                           ) : isClaimed ? (
                             <div className="flex items-center gap-0.5 text-[0.6rem] font-extrabold text-white/90">
                                +{rewardAmount}
                             </div>
                           ) : (
                             <div className={`text-[0.6rem] font-extrabold ${isToday && canClaim ? 'text-white' : 'text-zinc-500'}`}>+{rewardAmount}</div>
                           )}
                         </div>
                       )
                     });
                  })()}
                </div>

                {/* Days 14 & 30 row */}
                <div className="flex items-center justify-center gap-4">
                   <div className="flex min-w-[70px] flex-col items-center gap-0.5 rounded-xl border border-white/5 bg-black/20 px-3 py-2 transition-colors hover:border-primary/20 hover:bg-white/[0.02]">
                      <div className="text-[0.7rem] font-bold text-primary/80">Day 14</div>
                      <div className="text-xs font-bold text-white">+20 🥚</div>
                   </div>
                   <div className="text-lg font-bold tracking-[0.2em] text-white/20">•••</div>
                   <div className="flex min-w-[70px] flex-col items-center gap-0.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-colors hover:bg-primary/10">
                      <div className="text-[0.7rem] font-bold text-primary drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]">Day 30</div>
                      <div className="text-xs font-bold text-white">+30 🥚</div>
                   </div>
                </div>

                {/* Action Button */}
                <div className="mt-2">
                  {isContractsLoading ? (
                    <div className="h-[56px] w-full animate-pulse rounded-[16px] bg-white/10" />
                  ) : brokenStreak > 0 || isBroken ? (
                      <button 
                        onClick={handleRestoreStreak}
                        className="group relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[16px] bg-gradient-to-b from-red-500 to-red-700 p-3.5 text-white shadow-[0_8px_25px_rgba(239,68,68,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(239,68,68,0.4)] active:scale-95"
                      >
                        <div className="absolute inset-0 rounded-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)]" />
                        <div className="relative text-[0.85rem] font-black tracking-widest drop-shadow-md">RESTORE LOST STREAK</div>
                      </button>
                  ) : canClaim ? (
                      <button 
                        onClick={handleDailyClaim}
                        className="group relative flex w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[16px] bg-gradient-to-b from-amber-400 to-amber-600 p-3 text-black shadow-[0_8px_25px_rgba(245,158,11,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(245,158,11,0.5)] active:scale-95"
                      >
                        {/* Shimmer Effect */}
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%] animate-shimmer" />
                        <div className="absolute inset-0 rounded-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]" />
                        <div className="relative text-[0.9rem] font-black tracking-wide">CLAIM TODAY'S EGGS</div>
                        <div className="relative text-xs font-black opacity-90 drop-shadow-sm">+10 🥚</div>
                      </button>
                  ) : (
                      <button 
                        disabled
                        className="flex w-full flex-col items-center justify-center gap-1 rounded-[16px] border border-white/5 bg-black/40 p-3.5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] cursor-not-allowed"
                      >
                        <div className="text-[0.7rem] font-bold tracking-widest text-zinc-500">NEXT CLAIM IN</div>
                        <div className="text-[1.1rem] font-black tabular-nums tracking-widest text-primary drop-shadow-[0_0_8px_rgba(245,158,11,0.4)] animate-pulse">{timeUntilNextClaim}</div>
                      </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* --- LEADERBOARD TAB --- */}
      {activeTab === 'leaderboard' && (
        <div className="tab-content animate-slide-up" style={{ paddingBottom: '160px' }}>
          
          {/* Season Selector Segmented Control */}
          <div style={{ display: 'flex', background: '#1a1d24', padding: '4px', borderRadius: '12px', border: '1px solid #2e3340', marginBottom: '16px' }}>
            {['0', 'all'].map(tab => (
              <button
                key={tab}
                onClick={() => setSelectedSeasonTab(tab as any)}
                style={{
                  flex: 1, padding: '8px 0', fontSize: '0.8rem', fontWeight: 'bold', border: 'none', borderRadius: '8px',
                  background: selectedSeasonTab === tab ? '#2e3340' : 'transparent',
                  color: selectedSeasonTab === tab ? '#fff' : '#9ca3af',
                  transition: 'all 0.2s', cursor: 'pointer'
                }}
              >
                {tab === 'all' ? 'All Time' : `Season ${tab}`}
              </button>
            ))}
          </div>

          <section className="glass-panel">
            <div className="leaderboard-header">
              <div className="title">
                GLOBAL LEADERBOARD
              </div>
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
                <div style={{ color: '#9ca3af', textAlign: 'center', padding: '10px' }}>
                  No data yet!
                </div>
              ) : (
                currentLeaderboard.map((entry: any, index: any) => {
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
                        <div className="score" style={{ fontSize: '1rem' }}>{entry.seasonEggs.toLocaleString('en-US')}</div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{entry.lifetimePoints.toLocaleString('en-US')} TP</div>
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
            width: '100%', maxWidth: '448px', padding: '0 16px', zIndex: 90
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #1f232b 0%, #2e3340 100%)',
              border: '1px solid #f59e0b',
              borderRadius: '16px', padding: '12px 20px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 -4px 20px rgba(0,0,0,0.5)'
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
                <div style={{ fontWeight: '800', color: '#fff' }}>{yourRankData?.seasonEggs?.toLocaleString('en-US') || 0} Eggs</div>
                <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{yourRankData?.lifetimePoints?.toLocaleString('en-US') || 0} TP</div>
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
              <div className="title text-gold">
                USDC REWARDS 💰
              </div>
              <div style={{ background: '#1a1c1e', padding: '6px 12px', borderRadius: '12px', border: '1px solid #333', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Balance: <span style={{ color: '#f59e0b' }}>{eggBalance.toLocaleString()} 🥚</span>
              </div>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center', marginTop: '1rem' }}>
              Exchange your collected eggs for real USDC! (Base Network)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {REWARD_TIERS.map((reward) => (
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
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
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
          {!isConnected ? (
            <section className="glass-panel" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>👤</div>
              <h2 style={{ marginBottom: '1rem' }}>My Profile</h2>
              <p style={{ color: '#9ca3af' }}>Please connect your wallet to view your profile.</p>
            </section>
          ) : (
            <div style={{ background: '#0a0a0c', border: '1px solid #1f232b', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
              {/* Top Row: Avatar & Name */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px' }}>
                <img 
                  src={farcasterUser?.pfpUrl || "https://i.imgur.com/vH1NpwQ.png"} 
                  alt="Avatar" 
                  style={{ width: '64px', height: '64px', borderRadius: '16px', objectFit: 'cover', background: '#22262f' }} 
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
                    {farcasterUser?.displayName || "Egg Clicker Player"}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                    @{farcasterUser?.username || "anonymous"}
                  </div>
                </div>
              </div>

              {/* Middle Row: Wallet Address */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '14px', marginBottom: '24px', background: '#13151a', padding: '12px 16px', borderRadius: '12px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>
                <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>

              {/* Profile Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                <div style={{ background: '#13151a', padding: '16px', borderRadius: '12px', border: '1px solid #1f232b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>Season Eggs</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#f59e0b' }}>{seasonEggs.toLocaleString()}</span>
                </div>
                <div style={{ background: '#13151a', padding: '16px', borderRadius: '12px', border: '1px solid #1f232b', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '4px' }}>Current Rank</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#3b82f6' }}>#{yourRankData?.rank || '--'}</span>
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
                      boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)', cursor: 'pointer'
                    }}
                  >
                    <Share2 size={16} />
                    Share Profile
                  </button>
                  
                  {showShareOptions && (
                    <div className="absolute bottom-[110%] left-0 flex w-full flex-col gap-1 rounded-2xl border border-white/10 bg-[#0f1115]/95 p-2 shadow-2xl backdrop-blur-xl z-50">
                      <a
                        href={`https://x.com/intent/tweet?text=${encodeURIComponent("🥚 I just shared my 1 Million Egg profile!\n\nThink you can beat my score?\n\nTap the Egg. Earn Real USDC.\n\nhttps://1millionegg.xyz/player/" + address)}`}
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
                        href={`https://warpcast.com/~/compose?text=${encodeURIComponent("🥚 I just shared my 1 Million Egg profile!\n\nThink you can beat my score?\n\nTap the Egg. Earn Real USDC.\n\nhttps://1millionegg.xyz/player/" + address)}`}
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
                    width: '100%', padding: '14px', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', 
                    color: '#ef4444', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', 
                    gap: '8px', fontWeight: 'bold' 
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Disconnect Wallet
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <span>Home</span>
        </button>
        <button className={`nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveTab('leaderboard')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <span>Ranking</span>
        </button>
        <button className={`nav-item ${activeTab === 'rewards' ? 'active' : ''}`} onClick={() => setActiveTab('rewards')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
          </div>
          <span>Rewards</span>
        </button>
        <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
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
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ textAlign: 'center', margin: 0, fontSize: '1.2rem', color: '#fff' }}>Confirm Claim 🥚</h3>
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem', lineHeight: '1.5' }}>
              You are about to spend <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>{REWARD_TIERS.find(r => r.tier === confirmClaimTier)?.eggs} Eggs</span>.
              <br/><br/>
              These Eggs will also be removed from your Season Egg balance.
              <br/><br/>
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
