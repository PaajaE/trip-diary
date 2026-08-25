import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

export interface MetadataItem {
  icon?: LucideIcon
  label: string
}

interface MetadataRowProps {
  className?: string
  items: MetadataItem[]
}

export function MetadataRow({ className, items }: MetadataRowProps) {
  const visible = items.filter((item) => item.label.trim() !== '')
  if (visible.length === 0) {
    return null
  }

  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 text-sm leading-6 text-muted',
        className,
      )}
    >
      {visible.map((item) => {
        const Icon = item.icon
        return (
          <li
            className="inline-flex min-h-11 items-center gap-2"
            key={item.label}
          >
            {Icon === undefined ? null : (
              <Icon aria-hidden="true" className="shrink-0" size={15} />
            )}
            <span>{item.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
