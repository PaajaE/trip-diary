import { cn } from '@/shared/lib/cn'

interface NatureWishChipProps {
  active?: boolean
  checked: boolean
  label: string
  onSelect: () => void
}

export function NatureWishChip({
  active = false,
  checked,
  label,
  onSelect,
}: NatureWishChipProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        checked
          ? 'border-primary/25 bg-primary/8 text-foreground'
          : 'border-border/80 bg-background/50 text-foreground hover:bg-background',
        active && 'ring-2 ring-primary/20',
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2.5 rounded-full border',
          checked ? 'border-primary bg-primary' : 'border-muted bg-transparent',
        )}
      />
      <span className="max-w-[9rem] truncate">{label}</span>
    </button>
  )
}
