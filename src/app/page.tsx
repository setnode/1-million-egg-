'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useConnect, useDisconnect } from 'wagmi';
import { parseEther } from 'viem';
import toast, { Toaster } from 'react-hot-toast';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/constants/contract';
import sdk from '@farcaster/frame-sdk';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';

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
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [isClicked, setIsClicked] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [textIdCounter, setTextIdCounter] = useState(0);
  const [farcasterUser, setFarcasterUser] = useState<any>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  const [activeTab, setActiveTab] = useState<'home' | 'rewards' | 'leaderboard' | 'profile'>('home');

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

  const { data: eggBalanceData, refetch: refetchEggs } = useReadContract({
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

  const { writeContract, isPending, isSuccess } = useWriteContract();

  // Watch for transaction success to trigger a refetch
  const { isSuccess: isConfirming } = useWaitForTransactionReceipt({
    hash: undefined, // We would normally track the tx hash here if we captured it
  });

  // Re-fetch scores whenever a transaction succeeds
  useEffect(() => {
    if (isSuccess || isConfirming) {
      refetchUser();
      refetchGlobal();
      refetchEggs();
      refetchLeaderboard();
    }
  }, [isSuccess, isConfirming, refetchUser, refetchGlobal, refetchEggs, refetchLeaderboard]);

  const score = userScoreData ? Number(userScoreData) : 0;
  const eggBalance = eggBalanceData ? Number(eggBalanceData) : 0;
  const globalScore = globalScoreData ? Number(globalScoreData) : 0;
  const leaderboard = Array.isArray(leaderboardData) 
    ? [...leaderboardData].filter(entry => Number(entry.score) > 0).sort((a, b) => Number(b.score) - Number(a.score))
    : [];

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
      setFloatingTexts(prev => prev.filter(text => text.id !== newId));
    }, 1000);
  }, [isConnected, isPending, isConfirming, writeContract, textIdCounter]);

  const handleClaim = useCallback((tier: number) => {
    if (!isConnected) return;
    toast('Claim transaction sent...', { icon: '💰' });
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'claimReward',
      args: [tier],
    });
  }, [isConnected, writeContract]);

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
        <div className="tab-content fade-in">
          {/* Stats Header Area */}
          <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
            <section className="score-section" style={{ flex: 1 }}>
              <div className="score-label">Your Score</div>
              <div className="score-value">
                {score.toLocaleString('en-US')}
              </div>
              <div className="score-hint">Lifetime Taps</div>
            </section>

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

          {/* Global Stats */}
          <section className="glass-panel global-stats" style={{ marginTop: '1rem' }}>
            <div className="global-info">
              <h3>Global Score</h3>
              <div className="global-score">{globalScore.toLocaleString('en-US')}</div>
              <p>Total taps by all players worldwide</p>
            </div>
          </section>
        </div>
      )}

      {/* --- LEADERBOARD TAB --- */}
      {activeTab === 'leaderboard' && (
        <div className="tab-content fade-in">
          <section className="glass-panel">
            <div className="leaderboard-header">
              <div className="title">
                GLOBAL LEADERBOARD
              </div>
              <a href="#" className="top-link">TOP 20 <span>›</span></a>
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
        </div>
      )}

      {/* --- REWARDS TAB --- */}
      {activeTab === 'rewards' && (
        <div className="tab-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <section className="glass-panel">
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '14px', marginBottom: '32px', background: '#13151a', padding: '12px 16px', borderRadius: '12px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9.5h20"/></svg>
                <span>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  onClick={() => setShowShareModal(true)}
                  style={{ 
                    width: '100%', padding: '14px', background: 'var(--accent-blue)', color: '#fff', 
                    borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', 
                    gap: '8px', fontWeight: 'bold', border: 'none'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  Share My Score
                </button>

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

      {/* Share Modal */}
      {showShareModal && (
        <div 
          className="fade-in"
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            background: 'rgba(0,0,0,0.8)', zIndex: 1000, 
            display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
          }}
          onClick={() => setShowShareModal(false)}
        >
          <div 
            style={{ 
              background: '#0a0a0c', border: '1px solid #1f232b', borderRadius: '24px', 
              padding: '24px', width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '16px' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ textAlign: 'center', margin: 0, fontSize: '20px' }}>Share Your Score 🥚</h3>
            <p style={{ textAlign: 'center', color: '#9ca3af', margin: 0, fontSize: '14px' }}>Let everyone know how many eggs you've tapped!</p>
            
            <button 
              onClick={() => {
                  const text = encodeURIComponent(`I've tapped ${score.toLocaleString()} eggs and earned ${eggBalance.toLocaleString()} 🥚 on 1 Million Egg! Can you beat me?`);
                  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
                  setShowShareModal(false);
              }}
              style={{ width: '100%', padding: '14px', background: '#1da1f2', color: '#fff', border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Share on X (Twitter)
            </button>

            <button 
              onClick={() => {
                  const text = encodeURIComponent(`I've tapped ${score.toLocaleString()} eggs and earned ${eggBalance.toLocaleString()} 🥚 on 1 Million Egg! Can you beat me?`);
                  sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${text}`);
                  setShowShareModal(false);
              }}
              style={{ width: '100%', padding: '14px', background: '#8a63d2', color: '#fff', border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>
              Share on Farcaster
            </button>

            <button 
              onClick={() => {
                  navigator.clipboard.writeText("https://1-million-egg.vercel.app");
                  toast.success("Link copied to clipboard!");
                  setShowShareModal(false);
              }}
              style={{ width: '100%', padding: '14px', background: '#1f232b', color: '#fff', border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Copy Link
            </button>

            <button 
              onClick={() => setShowShareModal(false)}
              style={{ width: '100%', padding: '14px', background: 'transparent', color: '#9ca3af', border: 'none', borderRadius: '12px', fontWeight: 'bold', marginTop: '8px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
