import { Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EngagementTarget } from '@/entities/public-engagement/api/public-engagement.repository'
import { useHeart } from '@/features/public-engagement/api/use-public-engagement'
import { cn } from '@/shared/lib/cn'

interface HeartButtonProps {
  className?: string
  inverse?: boolean
  target: EngagementTarget
}

/** Heart with count. Renders nothing outside a public journey scope. */
export function HeartButton({ className, inverse, target }: HeartButtonProps) {
  const { t } = useTranslation()
  const heart = useHeart(target)
  if (heart === null) return null
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <button
        aria-label={`${t('publicEngagement.heart')} ${String(heart.count)}`}
        aria-pressed={heart.hearted}
        className={cn(
          'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold disabled:opacity-60',
          inverse ? 'border-white/60 text-white' : 'border-border',
        )}
        disabled={heart.busy}
        onClick={() => {
          void heart.toggle()
        }}
        type="button"
      >
        <Heart
          aria-hidden="true"
          className={cn('size-4', heart.hearted && 'fill-current')}
        />
        <span data-testid="heart-count">{heart.count}</span>
      </button>
      {heart.error !== null ? (
        <span className="text-xs text-destructive" role="alert">
          {t(`publicEngagement.error.${heart.error.kind}`)}
        </span>
      ) : null}
    </span>
  )
}
