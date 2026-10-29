import {
  ArrowRight,
  Columns2,
  Maximize,
  Undo2,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoState } from '@/features/journey-flow/model/sort-session'
import { cn } from '@/shared/lib/cn'

/** Keyboard key next to an action; only with a fine pointer and room for it. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="hidden rounded border border-current/30 px-1 font-sans text-[11px] font-semibold opacity-70 sm:[@media(hover:hover)_and_(pointer:fine)]:inline">
      {children}
    </kbd>
  )
}

const TOOL =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-white hover:bg-white/10 disabled:opacity-40'
const BIG =
  'flex min-h-14 items-center justify-center gap-2 rounded-2xl px-2 text-base font-bold disabled:opacity-40'

export interface SortToolsProps {
  canCompare: boolean
  canUndo: boolean
  onCompare: () => void
  onFullscreen?: () => void
  onMove: () => void
  onUndo: () => void
  onZoom: () => void
  zoomed: boolean
}

/** Zpět · Porovnat · Zoom · Přesunout (and "bez rušení" on a wide screen). */
export function SortTools({
  canCompare,
  canUndo,
  onCompare,
  onFullscreen,
  onMove,
  onUndo,
  onZoom,
  zoomed,
}: SortToolsProps) {
  const { t } = useTranslation()
  const tool = (
    icon: LucideIcon,
    label: string,
    key: string,
    onClick: () => void,
    options: { disabled?: boolean; pressed?: boolean } = {},
  ) => {
    const Icon = icon
    return (
      <button
        aria-pressed={options.pressed}
        className={TOOL}
        disabled={options.disabled}
        type="button"
        onClick={onClick}
      >
        <Icon aria-hidden="true" className="shrink-0" size={16} />
        {label}
        <Kbd>{key}</Kbd>
      </button>
    )
  }
  return (
    <div className="grid shrink-0 grid-cols-4 gap-0.5 px-2 pt-1.5 lg:flex lg:flex-wrap lg:justify-end lg:gap-1 lg:px-0 lg:pt-0">
      {tool(Undo2, t('flow.sort.back'), 'Z', onUndo, { disabled: !canUndo })}
      {tool(Columns2, t('flow.sort.compare'), 'C', onCompare, {
        disabled: !canCompare,
      })}
      {tool(ZoomIn, t('flow.sort.zoom'), '+', onZoom, { pressed: zoomed })}
      {tool(ArrowRight, t('flow.sort.move'), 'M', onMove)}
      {onFullscreen === undefined ? null : (
        <button
          aria-label={t('flow.sort.fullscreen')}
          className={cn(TOOL, 'hidden lg:flex')}
          title={t('flow.sort.fullscreen')}
          type="button"
          onClick={onFullscreen}
        >
          <Maximize aria-hidden="true" size={16} />
        </button>
      )}
    </div>
  )
}

export interface SortDecisionsProps {
  /** Hide the labels' extra text (full screen: ★ only). */
  compact?: boolean
  onBest: () => void
  onKeep: () => void
  onTrash: () => void
  starred: boolean
  /** A decided photo can still go to the trash or get ★; Nechat is done. */
  state: PhotoState
}

/** Koš · Nechat · ★ Nejlepší, the three decisions (56 px high). */
export function SortDecisions({
  compact = false,
  onBest,
  onKeep,
  onTrash,
  starred,
  state,
}: SortDecisionsProps) {
  const { t } = useTranslation()
  return (
    <div className="grid shrink-0 grid-cols-3 gap-2">
      <button
        className={cn(
          BIG,
          'bg-action-trash text-action-trash-foreground hover:bg-action-trash-hover',
        )}
        disabled={state === 'trash'}
        type="button"
        onClick={onTrash}
      >
        {t('flow.sort.trash')}
        <Kbd>K</Kbd>
      </button>
      <button
        className={cn(
          BIG,
          'bg-action-keep text-action-keep-foreground hover:bg-action-keep-hover',
        )}
        disabled={state !== 'open'}
        type="button"
        onClick={onKeep}
      >
        {t('flow.sort.keep')}
        <Kbd>N</Kbd>
      </button>
      <button
        aria-label={compact ? t('flow.sort.star') : undefined}
        aria-pressed={starred}
        className={cn(
          BIG,
          'bg-action-star text-action-star-foreground hover:bg-action-star-hover',
        )}
        disabled={state === 'trash'}
        title={t('flow.sort.starHint')}
        type="button"
        onClick={onBest}
      >
        {compact ? '★' : t('flow.sort.star')}
        <Kbd>S</Kbd>
      </button>
    </div>
  )
}
