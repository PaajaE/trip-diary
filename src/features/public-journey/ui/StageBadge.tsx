import { readableOn } from '@/shared/lib/stage-palette'
import { cn } from '@/shared/lib/cn'

interface StageBadgeProps {
  className?: string
  color: string
  label: string
}

/** Pill in the stage colour ("Etapa 2"); the text is white or ink, whichever reads better. */
export function StageBadge({ className, color, label }: StageBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
        className,
      )}
      style={{ backgroundColor: color, color: readableOn(color) }}
    >
      {label}
    </span>
  )
}
