import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BatchMoveTarget } from '@/features/media-batch/model/move-targets'
import { cn } from '@/shared/lib/cn'

interface BatchActionBarProps {
  allStarred: boolean
  count: number
  onClear: () => void
  onDone: () => void
  onMoveTo: (targetId: string) => void
  onNewStop: () => void
  onStar: () => void
  onTrash: () => void
  targets: readonly BatchMoveTarget[]
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
  onMoveTo,
  onNewStop,
  onStar,
  onTrash,
  targets,
}: BatchActionBarProps) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const disabled = count === 0
  return (
    <div
      aria-label={t('mediaBatch.toolbar')}
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-lg bg-foreground px-2 py-2 text-[13px] text-background shadow-soft min-[760px]:sticky min-[760px]:inset-x-auto min-[760px]:bottom-2 min-[760px]:mt-5"
      data-testid="batch-action-bar"
      role="toolbar"
    >
      {picking ? (
        <div
          aria-label={t('dayDetail.moveToTitle')}
          className="mb-2 flex max-h-56 flex-col gap-0.5 overflow-auto border-b border-background/20 pb-2"
          role="menu"
        >
          {targets.length === 0 ? (
            <p className="px-3 py-2 opacity-80">{t('mediaBatch.noStops')}</p>
          ) : (
            targets.map((target) => (
              <button
                className="min-h-11 rounded-sm px-3 text-left hover:bg-background/15"
                key={target.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  setPicking(false)
                  onMoveTo(target.id)
                }}
              >
                {target.label}
              </button>
            ))
          )}
        </div>
      ) : null}
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
          aria-expanded={picking}
          className={BUTTON}
          disabled={disabled}
          type="button"
          onClick={() => {
            setPicking((open) => !open)
          }}
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
