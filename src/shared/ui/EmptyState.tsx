import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

interface EmptyStateProps {
  action?: ReactNode
  className?: string
  description: string
  title: string
}

export function EmptyState({
  action,
  className,
  description,
  title,
}: EmptyStateProps) {
  return (
    <div className={cn('max-w-xl py-2', className)}>
      <h3 className="reader-display text-2xl tracking-[-0.03em] sm:text-3xl">
        {title}
      </h3>
      <p className="mt-3 text-base leading-7 text-muted">{description}</p>
      {action === undefined ? null : <div className="mt-6">{action}</div>}
    </div>
  )
}
