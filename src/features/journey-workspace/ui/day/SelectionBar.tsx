import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface MoveTarget {
  id: string
  label: string
}

interface SelectionBarProps {
  allStarred: boolean
  count: number
  onClear: () => void
  /** "Time and location" sheet; the button is absent without it. */
  onFixTimeLocation?: () => void
  onMoveTo: (targetId: string) => void
  onNewStop: () => void
  onStar: () => void
  onTrash: () => void
  targets: readonly MoveTarget[]
}

/** Sticky (desktop) / bottom-fixed (mobile) bar with actions on the selection. */
export function SelectionBar({
  allStarred,
  count,
  onClear,
  onFixTimeLocation,
  onMoveTo,
  onNewStop,
  onStar,
  onTrash,
  targets,
}: SelectionBarProps) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const disabled = count === 0
  const button =
    'rounded-sm px-2 py-1.5 font-medium opacity-90 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div
      aria-label={t('dayDetail.selectMode')}
      className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-lg bg-foreground px-3.5 py-2.5 text-[13px] text-background shadow-soft min-[760px]:sticky min-[760px]:inset-x-auto min-[760px]:bottom-2 min-[760px]:mt-5"
      role="toolbar"
    >
      {picking ? (
        <div
          aria-label={t('dayDetail.moveToTitle')}
          className="mb-2 flex max-h-48 flex-col gap-0.5 overflow-auto border-b border-background/20 pb-2"
          role="menu"
        >
          {targets.map((target) => (
            <button
              className="rounded-sm px-2 py-1.5 text-left hover:bg-background/15"
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
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-live="polite" role="status">
          {t('dayDetail.selected', { count })}
        </span>
        <button
          className={button}
          disabled={disabled}
          type="button"
          onClick={onStar}
        >
          {'★ '}
          {allStarred ? t('dayDetail.unstar') : t('dayDetail.pickBest')}
        </button>
        <button
          aria-expanded={picking}
          className={button}
          disabled={disabled || targets.length === 0}
          type="button"
          onClick={() => {
            setPicking((open) => !open)
          }}
        >
          {t('dayDetail.moveTo')}
        </button>
        <button
          className={button}
          disabled={disabled}
          type="button"
          onClick={onNewStop}
        >
          {t('dayDetail.stopNew')}
        </button>
        {onFixTimeLocation === undefined ? null : (
          <button
            aria-haspopup="dialog"
            className={button}
            disabled={disabled}
            type="button"
            onClick={onFixTimeLocation}
          >
            {t('mediaCorrections.action')}
          </button>
        )}
        <button
          className={button}
          disabled={disabled}
          type="button"
          onClick={onTrash}
        >
          {t('dayDetail.toTrash')}
        </button>
        <button className={`${button} ml-auto`} type="button" onClick={onClear}>
          {t('dayDetail.clearSelection')}
        </button>
      </div>
    </div>
  )
}
