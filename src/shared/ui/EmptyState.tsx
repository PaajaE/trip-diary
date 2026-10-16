import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

interface EmptyStateProps {
  action?: ReactNode
  className?: string
  description: string
  icon?: LucideIcon
  title: string
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-border bg-surface/50 px-6 py-10 text-center',
        className,
      )}
      data-testid="empty-state"
    >
      {Icon === undefined ? null : (
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
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
