import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

interface BatchActionBarProps {
  allStarred: boolean
  count: number
  onClear: () => void
  onDone: () => void
  /** Opens the Move-to sheet. */
  onOpenMove: () => void
  onNewStop: () => void
  onStar: () => void
  onTrash: () => void
}

const BUTTON =
  'min-h-11 min-w-11 touch-manipulation rounded-sm px-3 font-medium opacity-90 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40'

/**
 * Actions on the selection: bottom-fixed on narrow screens (above the iOS home
 * indicator), sticky under the grid from 760 px.
 */
export function BatchActionBar({
  allStarred,
  count,
  onClear,
  onDone,
  onOpenMove,
  onNewStop,
  onStar,
  onTrash,
}: BatchActionBarProps) {
  const { t } = useTranslation()
  const disabled = count === 0
  return (
    <div
      aria-label={t('mediaBatch.toolbar')}
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-lg bg-foreground px-2 py-2 text-[13px] text-background shadow-soft min-[760px]:sticky min-[760px]:inset-x-auto min-[760px]:bottom-2 min-[760px]:mt-5"
      data-testid="batch-action-bar"
      role="toolbar"
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <span
          aria-live="polite"
          className="px-2"
          data-testid="batch-selected"
          role="status"
        >
          {t('dayDetail.selected', { count })}
        </span>
        <button
          aria-pressed={allStarred}
          className={BUTTON}
          disabled={disabled}
          type="button"
          onClick={onStar}
        >
          {'★ '}
          {allStarred ? t('dayDetail.unstar') : t('dayDetail.pickBest')}
        </button>
        <button
          aria-haspopup="dialog"
          className={BUTTON}
          disabled={disabled}
          type="button"
          onClick={onOpenMove}
        >
          {t('dayDetail.moveTo')}
        </button>
        <button
          className={BUTTON}
          disabled={disabled}
          type="button"
          onClick={onNewStop}
        >
          {t('dayDetail.stopNew')}
        </button>
        <button
          className={BUTTON}
          disabled={disabled}
          type="button"
          onClick={onTrash}
        >
          {t('dayDetail.toTrash')}
        </button>
        <button
          className={cn(BUTTON, 'bg-primary font-semibold text-white')}
          disabled={disabled}
          title={t('mediaBatch.doneHint')}
          type="button"
          onClick={onDone}
        >
          {t('mediaBatch.done')}
        </button>
        <button
          className={cn(BUTTON, 'ml-auto')}
          type="button"
          onClick={onClear}
        >
          {t('dayDetail.clearSelection')}
        </button>
      </div>
    </div>
  )
}
