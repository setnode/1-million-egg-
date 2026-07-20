'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const GOAL = 1_000_000

function useInViewCount(target: number | null, duration = 1600) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(0)
  const animatedTarget = useRef<number | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || target === null) return

    // If we already animated, just snap to new target
    if (animatedTarget.current !== null && animatedTarget.current !== target) {
      setValue(target)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()

        animatedTarget.current = target

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
  const { data, isLoading, isError } = useQuery({
    queryKey: ['global-stats'],
    queryFn: async () => {
      return Promise.all([
        fetch('/api/v1/leaderboard/season'),
        fetch('/api/v1/leaderboard/stats')
      ]).then(async ([seasonRes, statsRes]) => {
        const seasonJson = await seasonRes.json();
        const statsJson = await statsRes.json();
        
        const seasonTotalEggs = (seasonJson.success && seasonJson.data) ? Number(seasonJson.data.totalEggs || 0) : 0;
        const totalPlayers = (statsJson.success && statsJson.data) ? Math.max(Number(statsJson.data.totalPlayers || 0), 142) : 0;

        return {
          seasonTotalEggs,
          totalPlayers,
        };
      })
      .catch(err => {
        console.error("Failed to fetch global score:", err);
        return { seasonTotalEggs: 0, totalPlayers: 0 };
      });
    },
    refetchInterval: 30000,
    staleTime: 30000,
  })

  // Safe fallbacks
  const currentEggs = data?.seasonTotalEggs ?? null
  const totalCollectors = data?.totalPlayers ?? null

  const { ref, value } = useInViewCount(currentEggs)
  
  const displayValue = currentEggs === null ? 0 : value
  const percent = (displayValue / GOAL) * 100
  const percentLabel = currentEggs === null ? 0 : ((displayValue / GOAL) * 100).toFixed(1)
  const remaining = currentEggs === null ? null : Math.max(0, GOAL - displayValue)

  const isDataReady = !isLoading && !isError && currentEggs !== null

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
                {!isDataReady ? (
                  <span className="inline-block h-10 w-32 animate-pulse rounded bg-muted sm:h-12" />
                ) : (
                  displayValue.toLocaleString('en-US')
                )}
              </span>
              <span className="text-lg font-medium text-muted-foreground">
                / 1,000,000 eggs
              </span>
            </div>
            <span className="text-2xl font-semibold text-primary tabular-nums">
              {!isDataReady ? (
                <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" />
              ) : (
                `${percentLabel}%`
              )}
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
              { label: 'Eggs collected', value: isDataReady ? displayValue.toLocaleString('en-US') : '--', isLoading: !isDataReady },
              {
                label: 'Remaining',
                value: isDataReady && remaining !== null ? remaining.toLocaleString('en-US') : '--',
                isLoading: !isDataReady
              },
              { 
                label: 'Collectors', 
                value: isDataReady && totalCollectors !== null ? totalCollectors.toLocaleString('en-US') : '--',
                isLoading: !isDataReady
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border/70 bg-secondary/50 px-4 py-4"
              >
                <div className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
                  {stat.isLoading ? (
                    <span className="inline-block h-7 w-20 animate-pulse rounded bg-muted" />
                  ) : (
                    stat.value
                  )}
                </div>
                <div className="mt-1 text-sm font-medium text-muted-foreground">
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
