import { UserRound } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

interface AvatarProps {
  className?: string
  label: string
  src?: string | null | undefined
}

export function Avatar({ className, label, src }: AvatarProps) {
  const initial = label.trim().slice(0, 1).toUpperCase()

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground',
        className,
      )}
    >
      {src === undefined || src === null ? (
        initial === '' ? (
          <UserRound size={18} />
        ) : (
          initial
        )
      ) : (
        <img alt="" className="size-full object-cover" src={src} />
      )}
    </span>
  )
}
