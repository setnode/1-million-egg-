'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import toast, { Toaster } from 'react-hot-toast';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';

interface FloatingText {
  id: number;
  x: number;
  y: number;
}

const REWARD_TIERS = [
  { tier: 1, eggs: 30, usdc: 0.10 },
  { tier: 2, eggs: 80, usdc: 0.50 },
  { tier: 3, eggs: 150, usdc: 1.00 },
  { tier: 4, eggs: 650, usdc: 5.00 },
  { tier: 5, eggs: 1200, usdc: 10.00 },
  { tier: 6, eggs: 5500, usdc: 50.00 },
  { tier: 7, eggs: 10500, usdc: 100.00 },
];

export default function Home() {
  const { address, isConnected } = useAccount();
  const [isClicked, setIsClicked] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [textIdCounter, setTextIdCounter] = useState(0);

  // Contract Reads
  const { data: globalScoreData, refetch: refetchGlobal } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'globalScore',
  });

  const { data: userScoreData, refetch: refetchUser } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'scores',
    args: [address as `0x${string}`],
    query: { enabled: !!address }
  });

  const { data: userEggData, refetch: refetchEggs } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'eggBalances',
    args: [address as `0x${string}`],
    query: { enabled: !!address }
  });

  const { data: leaderboardData, refetch: refetchLeaderboard } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLeaderboard',
  });

  // Contract Write (Tap & Claim)
  const { data: hash, writeContract, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // Handle successful confirmation
  useEffect(() => {
    if (isConfirmed) {
      toast.success('Transaction Successful!');
      refetchGlobal();
      refetchUser();
      refetchEggs();
      refetchLeaderboard();
    }
  }, [isConfirmed, refetchGlobal, refetchUser, refetchEggs, refetchLeaderboard]);

  // Handle wallet rejections / errors
  useEffect(() => {
    if (error) {
      if (error.message.includes('User rejected')) {
        toast.error('Transaction Cancelled');
      } else {
        toast.error('An error occurred: ' + error.message.slice(0, 30));
      }
    }
  }, [error]);

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

    const newId = textIdCounter;
    setTextIdCounter(prev => prev + 1);
    setFloatingTexts(prev => [...prev, { id: newId, x, y }]);

    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(t => t.id !== newId));
    }, 1000);
  }, [isConnected, isPending, isConfirming, textIdCounter, writeContract]);

  const handleClaim = useCallback((tier: number) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first!');
      return;
    }
    if (isPending || isConfirming) {
      toast('Transaction in progress, please wait...', { icon: '⏳' });
      return;
    }

    toast('Claiming reward, awaiting approval...', { icon: '🚀' });
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'claimReward',
      args: [tier],
    });
  }, [isConnected, isPending, isConfirming, writeContract]);

  const score = userScoreData ? Number(userScoreData) : 0;
  const eggBalance = userEggData ? Number(userEggData) : 0;
  const globalScore = globalScoreData ? Number(globalScoreData) : 0;
  
  // Parse Leaderboard (filter out empty entries)
  const leaderboard = leaderboardData 
    ? (leaderboardData as { player: string, score: bigint }[]).filter(entry => entry.player !== '0x0000000000000000000000000000000000000000')
    : [];

  return (
    <main className="container">
      <Toaster position="top-center" toastOptions={{
        style: {
          background: '#333',
          color: '#fff',
        },
      }} />

      {/* Header */}
      <header className="header">
        <div className="header-title">
          <h1>1 Million Egg</h1>
        </div>
        <div>
          <ConnectButton showBalance={false} chainStatus="none" />
        </div>
      </header>

      {/* Stats Header Area */}
      <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
        {/* Score Section */}
        <section className="score-section" style={{ flex: 1 }}>
          <div className="score-label">Your Score</div>
          <div className="score-value">
            {score.toLocaleString('en-US')}
          </div>
          <div className="score-hint">Lifetime Taps</div>
        </section>

        {/* Eggs Section */}
        <section className="score-section" style={{ flex: 1 }}>
          <div className="score-label text-gold">Your Eggs</div>
          <div className="score-value">
            {eggBalance.toLocaleString('en-US')} <span className="text-gold">🥚</span>
          </div>
          <div className="score-hint">Available to Spend</div>
        </section>
      </div>

      {/* Egg Clicker Area */}
      <section className="egg-container">
        <div 
          className={`egg-wrapper ${isClicked ? 'clicked' : ''}`}
          onClick={handleTap}
          onTouchStart={(e) => { e.preventDefault(); handleTap(e); }}
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
              className="floating-text"
              style={{ left: `${text.x}%`, top: `${text.y}%` }}
            >
              +1
            </div>
          ))}
        </div>
        
        <button className="tap-button" onClick={handleTap}>
          TAP THE EGG <br/> +1 <span style={{fontSize: '24px'}}>🥚</span>
        </button>
      </section>

      {/* Rewards Section */}
      <section className="glass-panel" style={{ marginTop: '2rem' }}>
        <div className="leaderboard-header">
          <div className="title text-gold">
            USDC REWARDS 💰
          </div>
        </div>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
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
                  onClick={() => handleClaim(reward.tier)}
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

      {/* Global Stats */}
      <section className="glass-panel global-stats">
        <div className="global-info">
          <h3>Global Score</h3>
          <div className="global-score">{globalScore.toLocaleString('en-US')}</div>
          <p>Total taps by all players worldwide</p>
        </div>
      </section>

      {/* Leaderboard */}
      <section className="glass-panel">
        <div className="leaderboard-header">
          <div className="title">
            GLOBAL LEADERBOARD
          </div>
          <a href="#" className="top-link">TOP 100 <span>›</span></a>
        </div>
        
        <div className="leaderboard-list">
          {leaderboard.length === 0 ? (
            <div style={{ color: '#9ca3af', textAlign: 'center', padding: '10px' }}>
              No taps yet! Be the first!
            </div>
          ) : (
            leaderboard.map((entry, index) => (
              <div key={index} className={`leaderboard-item ${entry.player === address ? 'current-user' : ''}`}>
                <div className="rank-info">
                  <span className="rank">{index + 1}</span>
                  <span className="name">{entry.player.slice(0, 6)}...{entry.player.slice(-4)}</span>
                </div>
                <div className="score">{Number(entry.score).toLocaleString('en-US')}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="footer-text">
        Tap. Earn. Climb. <span className="text-gold">🥚</span>
      </div>
    </main>
  );
}
