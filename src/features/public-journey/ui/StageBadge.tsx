import { cn } from '@/shared/lib/cn'

interface StageBadgeProps {
  className?: string
  color: string
  label: string
}

/** Pill in the stage colour ("Etapa 2"); sits on photos, hence the white text. */
export function StageBadge({ className, color, label }: StageBadgeProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  )
}
