import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export function StoryKicker({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        'text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase',
        className,
      )}
      {...props}
    />
  )
}
