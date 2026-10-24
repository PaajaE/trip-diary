import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { StateCard } from '@/shared/ui/StateCard'

interface EmptyStateProps {
  action?: ReactNode
  className?: string
  description: string
  icon?: LucideIcon
  title: string
}

/** The `empty` variant of `StateCard`; shows no icon unless one is given. */
export function EmptyState({ icon, ...rest }: EmptyStateProps) {
  return <StateCard {...rest} icon={icon ?? null} variant="empty" />
}
