import { Loader2 } from 'lucide-react'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import { cn } from '@/shared/lib/cn'

interface NatureWishRowProps {
  canEdit: boolean
  item: JourneyChecklistItem
  onOpen: () => void
  saving: boolean
}

export function NatureWishRow({
  canEdit,
  item,
  onOpen,
  saving,
}: NatureWishRowProps) {
  const checked = item.checkedAt !== null

  return (
    <button
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-background/80',
        checked && 'bg-primary/5',
        !canEdit && 'cursor-default',
      )}
      disabled={saving}
      onClick={onOpen}
      type="button"
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0 rounded-full border-2',
          checked ? 'border-primary bg-primary' : 'border-border',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{item.title}</span>
        {item.notes === '' ? null : (
          <span className="mt-1 block text-sm text-muted">{item.notes}</span>
        )}
      </span>
      {saving ? (
        <Loader2
          aria-hidden="true"
          className="mt-0.5 animate-spin text-muted"
          size={16}
        />
      ) : null}
    </button>
  )
}
