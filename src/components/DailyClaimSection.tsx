'use client';

import { useState, useEffect, memo } from 'react';

interface DailyClaimSectionProps {
  lastClaimTime: number;
  streakCount: number;
  brokenStreak: number;
  isLoading: boolean;
  onDailyClaim: () => void;
  onRestoreStreak: () => void;
}

function computeClaimState(lastClaimTime: number) {
  const now = Math.floor(Date.now() / 1000);
  if (lastClaimTime === 0) {
    return { canClaim: true, isBroken: false, timeString: null as string | null };
  }
  const nextClaimAvailable = lastClaimTime + 24 * 60 * 60;
  const streakBreaksAt = lastClaimTime + 48 * 60 * 60;

  if (now >= streakBreaksAt) {
    return { canClaim: false, isBroken: true, timeString: null as string | null };
  }
  if (now >= nextClaimAvailable) {
    return { canClaim: true, isBroken: false, timeString: null as string | null };
  }
  const diff = nextClaimAvailable - now;
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  return { canClaim: false, isBroken: false, timeString: `${hours}h ${mins}m ${secs}s` };
}

/**
 * Isolated component so the 1-second timer only re-renders this subtree,
 * not the entire page.
 */
export const DailyClaimSection = memo(function DailyClaimSection({
  lastClaimTime,
  streakCount,
  brokenStreak,
  isLoading,
  onDailyClaim,
  onRestoreStreak,
}: DailyClaimSectionProps) {
  const [claimState, setClaimState] = useState(() => computeClaimState(lastClaimTime));

  useEffect(() => {
    const initial = computeClaimState(lastClaimTime);
    setClaimState(initial);

    // Only start the interval when a countdown is actually running
    if (initial.canClaim || initial.isBroken) return;

    const interval = setInterval(() => {
      const next = computeClaimState(lastClaimTime);
      setClaimState(next);
      if (next.canClaim || next.isBroken) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [lastClaimTime]);

  const { canClaim, isBroken, timeString } = claimState;

  return (
    <section className="px-5 mb-8">
      <div className="relative overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.02] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl transition-all duration-300 hover:bg-white/[0.03]">
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
                {isLoading ? (
                  <div className="h-3 w-12 animate-pulse rounded bg-white/20 mb-0.5" />
                ) : (
                  <span className="text-[0.7rem] font-extrabold leading-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                    Day {streakCount === 0 ? 1 : streakCount}
                  </span>
                )}
                <span className="text-[0.6rem] font-bold tracking-wider uppercase leading-tight text-primary/80">Streak</span>
              </div>
            </div>
          </div>

          {/* Days Grid */}
          <div className="flex justify-between gap-1 border-b border-white/5 pb-5 mt-2">
            {(() => {
              const cycleDay = streakCount % 30 || (streakCount === 0 ? 1 : 30);
              let startDay = 1;
              if (cycleDay <= 7) startDay = 1;
              else if (cycleDay <= 14) startDay = 8;
              else if (cycleDay <= 21) startDay = 15;
              else if (cycleDay <= 28) startDay = 22;
              else startDay = 24;

              return Array.from({ length: 7 }, (_, i) => startDay + i).map(day => {
                const isToday = cycleDay === day || (streakCount === 0 && day === 1);
                const isPast = cycleDay > day;
                const isClaimed = isPast || (isToday && !canClaim);
                const isSpecial = day === 7 || day === 14 || day === 30;
                const rewardAmount = day === 7 || day === 14 ? 20 : day === 30 ? 30 : 10;

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
                    <div className={`text-[0.65rem] font-black tracking-wide ${isToday || isSpecial ? 'text-primary drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'text-zinc-500'}`}>
                      Day {day}
                    </div>
                    <div className="relative flex items-center justify-center h-5 w-5 mt-0.5">
                      {isLoading ? (
                        <div className="h-4 w-4 animate-pulse rounded-full bg-white/10" />
                      ) : isClaimed ? (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-[0.6rem] font-black text-black shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-in zoom-in duration-500">✓</div>
                      ) : (
                        <div className={`text-[0.8rem] transition-all duration-300 ${isPast ? 'grayscale opacity-40' : 'opacity-90'} ${isToday && canClaim ? 'animate-pulse scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''}`}>🥚</div>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="h-3 w-8 animate-pulse rounded bg-white/10 mt-0.5" />
                    ) : isClaimed ? (
                      <div className="flex items-center gap-0.5 text-[0.6rem] font-extrabold text-white/90">+{rewardAmount}</div>
                    ) : (
                      <div className={`text-[0.6rem] font-extrabold ${isToday && canClaim ? 'text-white' : 'text-zinc-500'}`}>+{rewardAmount}</div>
                    )}
                  </div>
                );
              });
            })()}
          </div>

          {/* Day 14 & 30 milestone row */}
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
            {isLoading ? (
              <div className="h-[56px] w-full animate-pulse rounded-[16px] bg-white/10" />
            ) : brokenStreak > 0 || isBroken ? (
              <button
                onClick={onRestoreStreak}
                className="group relative flex w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-[16px] bg-gradient-to-b from-red-500 to-red-700 p-3.5 text-white shadow-[0_8px_25px_rgba(239,68,68,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(239,68,68,0.4)] active:scale-95"
              >
                <div className="absolute inset-0 rounded-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)]" />
                <div className="relative text-[0.85rem] font-black tracking-widest drop-shadow-md">RESTORE LOST STREAK</div>
              </button>
            ) : canClaim ? (
              <button
                onClick={onDailyClaim}
                className="group relative flex w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[16px] bg-gradient-to-b from-amber-400 to-amber-600 p-3 text-black shadow-[0_8px_25px_rgba(245,158,11,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(245,158,11,0.5)] active:scale-95"
              >
                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] bg-[length:200%_100%] animate-shimmer" />
                <div className="absolute inset-0 rounded-[16px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)]" />
                <div className="relative text-[0.9rem] font-black tracking-wide">CLAIM TODAY&apos;S EGGS</div>
                <div className="relative text-xs font-black opacity-90 drop-shadow-sm">+10 🥚</div>
              </button>
            ) : (
              <button
                disabled
                className="flex w-full flex-col items-center justify-center gap-1 rounded-[16px] border border-white/5 bg-black/40 p-3.5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] cursor-not-allowed"
              >
                <div className="text-[0.7rem] font-bold tracking-widest text-zinc-500">NEXT CLAIM IN</div>
                <div className="text-[1.1rem] font-black tabular-nums tracking-widest text-primary drop-shadow-[0_0_8px_rgba(245,158,11,0.4)] animate-pulse">
                  {timeString}
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});
