import { ArrowLeftRight, ChevronLeft, Maximize, Undo2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ZOOM_LEVELS } from '@/features/media-batch/model/zoom'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'
import { cn } from '@/shared/lib/cn'

const HEAD_BTN =
  'flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40'

/** Top of Porovnání: back, title, Undo, swap sides, full screen. */
export function DuelHeader({
  backLabel,
  canSwap,
  canUndo,
  compare,
  fullscreen,
  onClose,
  onFullscreen,
  onUndo,
  subtitle,
  titleId,
}: {
  backLabel: string
  canSwap: boolean
  canUndo: boolean
  compare: PhotoCompareApi
  fullscreen: boolean
  onClose: () => void
  onFullscreen: () => void
  onUndo: () => void
  subtitle: string
  titleId: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))]',
        fullscreen && 'absolute inset-x-0 top-0 z-10 bg-black/70',
      )}
    >
      <button
        aria-label={backLabel}
        className={HEAD_BTN}
        type="button"
        onClick={onClose}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold" id={titleId}>
          {t('flow.duel.title')}
        </h2>
        <p className="truncate text-xs text-white/70">{subtitle}</p>
      </div>
      <button
        aria-label={t('flow.sort.back')}
        className={HEAD_BTN}
        disabled={!canUndo}
        type="button"
        onClick={onUndo}
      >
        <Undo2 aria-hidden="true" size={20} />
      </button>
      {/* Tab swaps on a keyboard; on touch this button does. */}
      <button
        aria-label={t('flow.duel.swap')}
        aria-pressed={compare.swapped}
        className={HEAD_BTN}
        disabled={!canSwap}
        type="button"
        onClick={compare.swap}
      >
        <ArrowLeftRight aria-hidden="true" size={20} />
      </button>
      <button
        aria-label={
          fullscreen ? t('flow.sort.fullscreenExit') : t('flow.sort.fullscreen')
        }
        aria-pressed={fullscreen}
        className={HEAD_BTN}
        type="button"
        onClick={onFullscreen}
      >
        {fullscreen ? (
          <X aria-hidden="true" size={20} />
        ) : (
          <Maximize aria-hidden="true" size={20} />
        )}
      </button>
    </div>
  )
}

/** Celá · 100 % · 200 %, the zoom presets shared by both photos. */
export function DuelZoom({ compare }: { compare: PhotoCompareApi }) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-1.5">
      <div
        aria-label={t('flow.duel.zoomLabel')}
        className="flex rounded-xl bg-white/10 p-0.5"
        role="group"
      >
        {ZOOM_LEVELS.map((level) => (
          <button
            aria-pressed={compare.level === level}
            className={cn(
              'min-h-11 min-w-14 rounded-lg px-2 text-sm font-semibold',
              compare.level === level ? 'bg-white text-black' : 'text-white',
            )}
            key={String(level)}
            type="button"
            onClick={() => {
              compare.zoomTo(level)
            }}
          >
            {level === 'fit'
              ? t('flow.duel.zoomFit')
              : `${String(level * 100)} %`}
          </button>
        ))}
      </div>
      <span className="text-xs text-white/70">{t('flow.duel.zoomHint')}</span>
    </div>
  )
}
