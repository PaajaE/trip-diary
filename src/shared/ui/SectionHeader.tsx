import type { ReactNode } from 'react'
import { StoryKicker } from '@/shared/ui/StoryKicker'
import { cn } from '@/shared/lib/cn'

interface SectionHeaderProps {
  action?: ReactNode
  className?: string
  description?: string
  eyebrow: string
  headingId?: string
  title: string
}

export function SectionHeader({
  action,
  className,
  description,
  eyebrow,
  headingId,
  title,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <StoryKicker>{eyebrow}</StoryKicker>
        <h2
          className="reader-display mt-2 text-3xl tracking-[-0.03em] sm:text-4xl"
          {...(headingId === undefined ? {} : { id: headingId })}
        >
          {title}
        </h2>
        {description === undefined || description === '' ? null : (
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
            {description}
          </p>
        )}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  )
}
