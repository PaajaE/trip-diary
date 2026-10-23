import { cn } from '@/shared/lib/cn'

export interface StageStripItem {
  color: string
  id: string
  label: string
  /** Relative width; days of the stage (at least 1). */
  weight: number
}

interface StageStripProps {
  className?: string
  /** Highlighted stage; the others are faded. */
  currentId?: string
  items: readonly StageStripItem[]
}

/**
 * Strip of the journey's stages, each as wide as it has days, in the stage
 * colour. Purely presentational (the labels are for screen readers).
 */
export function StageStrip({ className, currentId, items }: StageStripProps) {
  if (items.length === 0) return null
  return (
    <ul className={cn('flex h-1.5 gap-0.5', className)}>
      {items.map((item) => (
        <li
          className={cn(
            'min-w-1 overflow-hidden rounded-full',
            currentId !== undefined && item.id !== currentId && 'opacity-35',
          )}
          key={item.id}
          style={{ backgroundColor: item.color, flexGrow: item.weight }}
        >
          <span className="sr-only">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
