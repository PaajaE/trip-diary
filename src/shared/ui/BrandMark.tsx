import { cn } from '@/shared/lib/cn'

interface BrandMarkProps {
  className?: string
}

/**
 * Trip Diary mark: a map pin holding a mountain. Same shape as the app icon
 * (public/app-icon.svg), coloured with the theme tokens so it follows dark mode.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-8 shrink-0', className)}
      focusable="false"
      viewBox="96 62 320 400"
    >
      <path
        className="fill-primary"
        d="M256 72c-83 0-150 67-150 150 0 111 150 225 150 225s150-114 150-225c0-83-67-150-150-150Z"
      />
      <path className="fill-surface" d="M256 139 164 314h184L256 139Z" />
      <path className="fill-accent" d="M256 207 205 314h102L256 207Z" />
      <circle className="fill-primary" cx="256" cy="222" r="22" />
    </svg>
  )
}
