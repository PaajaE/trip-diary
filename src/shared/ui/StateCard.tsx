import { AlertTriangle, CheckCircle2, Inbox, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export type StateCardVariant = 'empty' | 'error' | 'offline' | 'success'

interface StateCardProps {
  action?: ReactNode
  className?: string
  description: string
  /** Overrides the variant's default icon; `null` shows none. */
  icon?: LucideIcon | null
  title: string
  variant?: StateCardVariant
}

const DEFAULT_ICON: Record<StateCardVariant, LucideIcon> = {
  empty: Inbox,
  error: AlertTriangle,
  offline: WifiOff,
  success: CheckCircle2,
}

const FRAME: Record<StateCardVariant, string> = {
  empty: 'border-dashed border-border bg-surface/50',
  error: 'border-destructive/30 bg-destructive/5',
  offline: 'border-border bg-surface',
  success: 'border-primary/30 bg-primary/5',
}

const BADGE: Record<StateCardVariant, string> = {
  empty: 'bg-primary/10 text-primary',
  error: 'bg-destructive/10 text-destructive',
  offline: 'bg-background text-muted',
  success: 'bg-primary/10 text-primary',
}

/**
 * One look for empty, offline, error and success states: round icon, title,
 * calm text and an optional action. `EmptyState` is the `empty` variant.
 */
export function StateCard({
  action,
  className,
  description,
  icon,
  title,
  variant = 'empty',
}: StateCardProps) {
  const Icon = icon === undefined ? DEFAULT_ICON[variant] : icon
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border px-6 py-10 text-center',
        FRAME[variant],
        className,
      )}
      data-testid={variant === 'empty' ? 'empty-state' : 'state-card'}
      data-variant={variant}
      role={
        variant === 'error'
          ? 'alert'
          : variant === 'empty'
            ? undefined
            : 'status'
      }
    >
      {Icon === null ? null : (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-12 items-center justify-center rounded-full',
            BADGE[variant],
          )}
        >
          <Icon size={22} />
        </span>
      )}
      <h2 className="reader-display mt-4 text-xl tracking-[-0.02em] sm:text-2xl">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-base leading-7 text-muted">
        {description}
      </p>
      {action === undefined ? null : <div className="mt-6">{action}</div>}
    </div>
  )
}
