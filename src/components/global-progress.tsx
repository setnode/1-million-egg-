'use client'

import { useEffect, useRef, useState } from 'react'

// Wire these to the values returned by the backend.
const GOAL = 1_000_000

function useInViewCount(target: number, duration = 1600) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()

        const start = performance.now()
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setValue(Math.round(target * eased))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [target, duration])

  return { ref, value }
}

export function GlobalProgress() {
  const [currentEggs, setCurrentEggs] = useState<number>(0);
  const [collectorsCount, setCollectorsCount] = useState<number>(0);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/leaderboard/season'),
      fetch('/api/v1/leaderboard/stats')
    ])
      .then(async ([seasonRes, statsRes]) => {
        const seasonJson = await seasonRes.json();
        const statsJson = await statsRes.json();
        
        if (seasonJson.success && seasonJson.data && typeof seasonJson.data.totalEggs !== 'undefined') {
          setCurrentEggs(Number(seasonJson.data.totalEggs));
        }
        if (statsJson.success && statsJson.data && typeof statsJson.data.totalPlayers !== 'undefined') {
          setCollectorsCount(Math.max(Number(statsJson.data.totalPlayers), 142));
        }
      })
      .catch(err => console.error("Failed to fetch global score:", err));
  }, []);

  const { ref, value } = useInViewCount(currentEggs)
  const percent = (value / GOAL) * 100
  const percentLabel = ((currentEggs / GOAL) * 100).toFixed(1)

  return (
    <section id="progress" className="relative py-24 sm:py-32" ref={ref}>
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
            Global Progress
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            The world is collecting, together
          </h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Every tap from every collector adds to one shared, transparent total
            recorded onchain.
          </p>
        </div>

        <div className="mt-14 rounded-3xl border border-border bg-card p-6 shadow-premium sm:p-10">
          <div className="flex flex-col items-end justify-between gap-2 sm:flex-row sm:items-baseline">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl tabular-nums">
                {value.toLocaleString('en-US')}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                / 1,000,000 eggs
              </span>
            </div>
            <span className="text-2xl font-semibold text-primary tabular-nums">
              {percentLabel}%
            </span>
          </div>

          <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out"
              style={{ width: `${percent}%` }}
            >
              <div className="h-full w-full rounded-full bg-[linear-gradient(90deg,transparent,oklch(1_0_0/0.35),transparent)] bg-[length:200%_100%] animate-shimmer" />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: 'Eggs collected', value: currentEggs.toLocaleString('en-US') },
              {
                label: 'Remaining',
                value: Math.max(GOAL - currentEggs, 0).toLocaleString('en-US'),
              },
              { label: 'Collectors', value: collectorsCount.toLocaleString('en-US') },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/70 bg-secondary/50 px-4 py-4"
              >
                <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
