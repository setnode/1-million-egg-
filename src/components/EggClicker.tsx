'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';

interface FloatingText {
  id: number;
  x: number;
  y: number;
}

interface EggClickerProps {
  isPending: boolean;
  isConfirming: boolean;
  isConnected: boolean;
  /** The contract-write logic lives in the parent; this component owns only the animation. */
  onTap: () => Promise<void>;
}

/**
 * Owns the click animation and floating "+1" texts.
 * Keeping this state here prevents every tap from re-rendering the whole page.
 */
export function EggClicker({ onTap }: EggClickerProps) {
  const [isClicked, setIsClicked] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);

  const handleInteraction = useCallback(
    async (e?: React.MouseEvent | React.TouchEvent) => {
      // Visual feedback — immediate, synchronous
      setIsClicked(true);
      setTimeout(() => setIsClicked(false), 100);

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

      const id = Date.now() + Math.random();
      setFloatingTexts(prev => [...prev, { id, x, y }]);
      setTimeout(() => {
        setFloatingTexts(prev => prev.filter(t => t.id !== id));
      }, 800);

      // Contract write — async, runs in parallel with animation
      await onTap();
    },
    [onTap]
  );

  return (
    <section className="egg-container">
      <div
        className={`egg-wrapper ${isClicked ? 'clicked' : ''}`}
        onClick={handleInteraction}
      >
        <div className="egg-glow" />
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
          onClick={handleInteraction}
        >
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
  );
}
