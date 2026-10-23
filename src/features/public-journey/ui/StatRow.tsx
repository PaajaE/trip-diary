import { cn } from '@/shared/lib/cn'

export interface Stat {
  label: string
  value: string
}

interface StatRowProps {
  className?: string
  /** `light` sits on a dark photo (journey hero), `dark` on the page. */
  tone?: 'dark' | 'light'
  stats: readonly Stat[]
}

/** Row of big numbers with small labels (days, stages, km, photos). */
export function StatRow({ className, stats, tone = 'dark' }: StatRowProps) {
  if (stats.length === 0) return null
  return (
    <dl className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}>
      {stats.map((stat) => (
        <div className="flex flex-col-reverse" key={stat.label}>
          <dt
            className={cn(
              'text-xs',
              tone === 'light' ? 'text-white/80' : 'text-muted',
            )}
          >
            {stat.label}
          </dt>
          <dd
            className={cn(
              'reader-display text-xl tabular-nums',
              tone === 'light' && 'text-white',
            )}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
