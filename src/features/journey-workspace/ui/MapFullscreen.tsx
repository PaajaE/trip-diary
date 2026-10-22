import { Minimize2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { chapterTitle } from '@/features/journey-workspace/lib/chapter-labels'
import { STRIP_PALETTE } from '@/features/journey-workspace/lib/stage-colors'
import type { OverviewChapter } from '@/features/journey-workspace/model/workspace-overview'
import { cn } from '@/shared/lib/cn'

/**
 * The map over the whole workspace. On wide screens it covers the body of the
 * workspace card (below the task bar); on narrow ones it is a fixed overlay
 * with the controls floating over the map.
 */
export function MapFullscreen({
  chapters,
  children,
  filterId,
  floating,
  onClose,
  onFilter,
}: {
  chapters: OverviewChapter[]
  children: ReactNode
  /** Stage the map is focused on; null = whole journey. */
  filterId: string | null
  /** Narrow screens: fixed overlay, controls on top of the map. */
  floating: boolean
  onClose: () => void
  onFilter: (chapterId: string | null) => void
}) {
  const { t } = useTranslation()
  const stages = chapters.filter((c) => c.kind === 'stage')
  const chipList: { color: string; id: string | null; name: string }[] = [
    { color: '#1f231e', id: null, name: t('workspace.layout.wholeJourney') },
    ...stages.map((c) => ({
      color: STRIP_PALETTE[c.colorIndex % STRIP_PALETTE.length] ?? '#9bb59f',
      id: c.id,
      name: chapterTitle(c, t('workspace.looseMoments')),
    })),
  ]
  const chips = (
    <div
      aria-label={t('workspace.layout.stageFilter')}
      className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
      role="group"
    >
      {chipList.map((chip) => {
        const on = chip.id === filterId
        return (
          <button
            aria-pressed={on}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full text-[12.5px] font-semibold',
              floating ? 'h-9 px-3 shadow-soft' : 'h-[34px] border px-3',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground',
            )}
            key={chip.id ?? 'all'}
            type="button"
            onClick={() => {
              onFilter(chip.id)
            }}
          >
            <span
              aria-hidden="true"
              className="size-[9px] rounded-full"
              style={{ backgroundColor: chip.color }}
            />
            {chip.name}
          </button>
        )
      })}
    </div>
  )

  if (floating)
    return (
      <div
        aria-label={t('workspace.layout.mapTitle')}
        aria-modal="true"
        className="fixed inset-0 z-50 flex flex-col bg-sunk"
        role="dialog"
      >
        {/* The bar sits above the map, not over it: the map has its own
            controls in the corners. */}
        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-3 pt-3 pb-2.5 [padding-top:max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <button
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface px-3.5 font-semibold text-primary shadow-soft"
              type="button"
              onClick={onClose}
            >
              <X aria-hidden="true" size={16} />
              {t('workspace.layout.closeMap')}
            </button>
          </div>
          {chips}
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    )

  return (
    <div
      aria-label={t('workspace.layout.mapTitle')}
      className="absolute inset-0 z-10 bg-background"
      role="dialog"
    >
      <div className="sticky top-20 flex h-[calc(100svh-6rem)] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-3.5 py-2.5">
          <h2 className="shrink-0 reader-display text-xl">
            {t('workspace.layout.mapTitle')}
          </h2>
          {chips}
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 font-semibold text-primary hover:bg-sunk"
            title={`${t('workspace.layout.backToOverview')} ( Esc )`}
            type="button"
            onClick={onClose}
          >
            <Minimize2 aria-hidden="true" size={15} />
            {t('workspace.layout.backToOverview')}
            <kbd className="rounded-[5px] border border-border px-1.5 py-px font-sans text-[11px] text-muted">
              Esc
            </kbd>
          </button>
        </div>
        <div className="min-h-0 flex-1 p-3">{children}</div>
      </div>
    </div>
  )
}
