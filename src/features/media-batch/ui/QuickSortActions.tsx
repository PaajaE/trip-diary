import { Check, Star, Trash2, Undo2 } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

export const SORT_BIG =
  'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-3 text-base font-semibold disabled:opacity-40'

export interface QuickSortActionsProps {
  acceptLabel: string
  canUndo: boolean
  isHandled: boolean
  onAccept: () => void
  onDone: () => void
  onStar: () => void
  onTrash: () => void
  onUndo: () => void
  starred: boolean
}

/** File (primary), Undo, Trash, ★ and "Sorted" of quick sort. */
export function QuickSortActions({
  acceptLabel,
  canUndo,
  isHandled,
  onAccept,
  onDone,
  onStar,
  onTrash,
  onUndo,
  starred,
}: QuickSortActionsProps) {
  const { t } = useTranslation()
  const starHintId = useId()
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <button
        className={cn(
          SORT_BIG,
          'bg-action-keep text-action-keep-foreground hover:bg-action-keep-hover',
        )}
        disabled={isHandled}
        type="button"
        onClick={onAccept}
      >
        {acceptLabel}
      </button>
      <div className="flex gap-2">
        <button
          aria-label={t('quickSort.undo')}
          className={cn(
            SORT_BIG,
            'w-16 shrink-0 bg-white/10 hover:bg-white/20',
          )}
          disabled={!canUndo}
          type="button"
          onClick={onUndo}
        >
          <Undo2 aria-hidden="true" />
        </button>
        <button
          className={cn(
            SORT_BIG,
            'flex-1 bg-action-trash text-action-trash-foreground hover:bg-action-trash-hover',
          )}
          disabled={isHandled}
          type="button"
          onClick={onTrash}
        >
          <Trash2 aria-hidden="true" />
          {t('quickSort.trash')}
        </button>
        <button
          aria-describedby={starHintId}
          aria-pressed={starred}
          className={cn(
            SORT_BIG,
            'flex-1 bg-action-star text-action-star-foreground hover:bg-action-star-hover',
          )}
          disabled={isHandled}
          title={t('quickSort.starHint')}
          type="button"
          onClick={onStar}
        >
          <Star
            aria-hidden="true"
            className={starred ? 'fill-action-star-foreground' : ''}
          />
          {t(starred ? 'quickSort.unstar' : 'quickSort.star')}
        </button>
        <span className="sr-only" id={starHintId}>
          {t('quickSort.starHint')}
        </span>
        <button
          className={cn(SORT_BIG, 'bg-white/10 text-sm hover:bg-white/20')}
          disabled={isHandled}
          title={t('quickSort.doneHint')}
          type="button"
          onClick={onDone}
        >
          <Check aria-hidden="true" size={18} />
          {t('quickSort.done')}
        </button>
      </div>
    </div>
  )
}
