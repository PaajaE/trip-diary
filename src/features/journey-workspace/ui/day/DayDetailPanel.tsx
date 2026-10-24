import { ArrowLeft, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDayNotes } from '@/entities/day-note/api/use-day-notes'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import {
  dayMediaCounts,
  dayStatus,
} from '@/features/journey-workspace/model/day-status'
import { buildDayStops } from '@/features/journey-workspace/model/day-stops'
import {
  dayPlaceNames,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import { DayStatusChips } from '@/features/journey-workspace/ui/DayStatusChips'
import { CullView } from '@/features/journey-workspace/ui/cull/CullView'
import { DayMiniMap } from '@/features/journey-workspace/ui/day/DayMiniMap'
import { DayNoteEditor } from '@/features/journey-workspace/ui/day/DayNoteEditor'
import { DayStops } from '@/features/journey-workspace/ui/day/DayStops'
import { stopElementId } from '@/features/journey-workspace/ui/day/ids'
import { SelectionBar } from '@/features/journey-workspace/ui/day/SelectionBar'
import type { DayMediaActions } from '@/features/journey-workspace/ui/day/use-day-media-actions'
import { useDaySelection } from '@/features/journey-workspace/ui/day/use-day-selection'
import { useNarrowScreen } from '@/features/journey-workspace/ui/day/use-narrow-screen'
import { isMediaCorrectionsEnabled } from '@/features/media-corrections/model/enabled'
import { FixTimeLocationSheet } from '@/features/media-corrections/ui/FixTimeLocationSheet'
import { cn } from '@/shared/lib/cn'

export interface DayChip {
  key: string
  label: string
}

export interface DayDetailPanelProps {
  /** Move / new-stop actions: `useDayMediaActions(journeyId)`. */
  actions: DayMediaActions
  baseUrl: string
  canEdit: boolean
  /** Breadcrumb, usually the stage title. */
  crumb?: string
  /** Local day key ("2026-06-03") or UNKNOWN_DAY; also the day note's date. */
  dayKey: string
  /** Heading, e.g. "Středa 3. června". */
  dayLabel: string
  /** "Den N" of the journey, null when unknown. */
  dayNumber: number | null
  /** Days of the stage for the side list (active one is `dayKey`). */
  days: readonly DayChip[]
  edits: WorkspaceEdits
  journeyId: string
  locale: string
  /** All moments that start on this day (any order). */
  moments: readonly WorkspaceMoment[]
  onClose: () => void
  /** Null disables the button / arrow. */
  onNext: (() => void) | null
  /** Open MediaViewer; `trigger` gets focus back on close. */
  onOpenMedia: (item: MediaItem, trigger: HTMLElement) => void
  onPrev: (() => void) | null
  onSelectDay: (dayKey: string) => void
  /** Place names by place id (as the workspace resolves them). */
  placeNames: ReadonlyMap<string, string>
  /**
   * Culling ("Výběr nejlepších"): the top bar button toggles `open`; the view
   * covers the day's photos in display order. Omit to hide the button.
   */
  cull?: {
    onOpenChange: (open: boolean) => void
    open: boolean
    restoreMedia: (items: MediaItem[]) => Promise<boolean>
  }
  /** Extra controls in each stop header (e.g. the moment "..." menu). */
  renderStopMenu?: (entry: WorkspaceMoment) => ReactNode
  /** Set false while a modal (MediaViewer) is open so it keeps the keys. */
  shortcutsActive?: boolean
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
  )
}

export function DayDetailPanel(props: DayDetailPanelProps) {
  // A new day starts with a clean selection and fresh editors.
  return <DayDetailBody key={props.dayKey} {...props} />
}

function DayDetailBody({
  actions,
  baseUrl,
  canEdit,
  crumb,
  cull,
  dayKey,
  dayLabel,
  dayNumber,
  days,
  edits,
  journeyId,
  locale,
  moments,
  onClose,
  onNext,
  onOpenMedia,
  onPrev,
  onSelectDay,
  placeNames,
  renderStopMenu,
  shortcutsActive = true,
}: DayDetailPanelProps) {
  const { t } = useTranslation()
  const notes = useDayNotes(journeyId)
  const selection = useDaySelection()
  const narrow = useNarrowScreen()
  const [mapOpen, setMapOpen] = useState(false)
  const [fixOpen, setFixOpen] = useState(false)

  const stops = useMemo(
    () =>
      buildDayStops(moments, (entry) =>
        entry.moment.placeId === null
          ? null
          : (placeNames.get(entry.moment.placeId) ?? null),
      ),
    [moments, placeNames],
  )
  const allMedia = useMemo(() => stops.flatMap((stop) => stop.media), [stops])
  const mediaOrder = useMemo(() => {
    // Visual order: hero first inside each stop, then the rest.
    return stops.flatMap((stop) => {
      const hero = stop.hero
      return hero === null
        ? stop.media.map((m) => m.id)
        : [
            hero.id,
            ...stop.media.filter((m) => m.id !== hero.id).map((m) => m.id),
          ]
    })
  }, [stops])
  const orderedMedia = useMemo(() => {
    const byId = new Map(allMedia.map((item) => [item.id, item]))
    return mediaOrder.flatMap((id) => {
      const item = byId.get(id)
      return item === undefined ? [] : [item]
    })
  }, [allMedia, mediaOrder])
  const [cullOpener, setCullOpener] = useState<HTMLElement | null>(null)
  const cullOpen = cull?.open === true
  const photoCount = stops.reduce((n, stop) => n + stop.photoCount, 0)
  const dated = dayKey !== UNKNOWN_DAY
  const places = dayPlaceNames(
    { key: dayKey, moments: [...moments], photoCount, placeIds: [] },
    (id) => placeNames.get(id),
    3,
  )
  const status = dayStatus({
    dated,
    hasNote: notes.byDate.has(dayKey),
    ...dayMediaCounts(moments),
  })
  const meta = [
    dayNumber === null ? null : t('dayDetail.dayOf', { n: dayNumber }),
    places.length > 0 ? places.join(' · ') : null,
    photoCount > 0 ? t('terms.photo.count', { count: photoCount }) : null,
    t('dayDetail.stops', { count: stops.length }),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  const selected = useMemo(
    () => allMedia.filter((item) => selection.ids.has(item.id)),
    [allMedia, selection.ids],
  )
  const orderedSelected = useMemo(
    () => orderedMedia.filter((item) => selection.ids.has(item.id)),
    [orderedMedia, selection.ids],
  )

  useEffect(() => {
    if (!shortcutsActive || cullOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return
      // A dialog (menu sheet, editor, viewer) owns the keys while it is open.
      if (document.querySelector('[role="dialog"]') !== null) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape') {
        if (selection.mode) selection.clear()
        else onClose()
      } else if (event.key === 'ArrowLeft') {
        onPrev?.()
      } else if (event.key === 'ArrowRight') {
        onNext?.()
      }
    }
    // Capture phase: runs before a dialog closes itself on the same key.
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [cullOpen, onClose, onNext, onPrev, selection, shortcutsActive])

  function scrollToStop(stopId: string): void {
    document
      .getElementById(stopElementId(stopId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function starSelected(): Promise<void> {
    const allStarred = selected.every((item) => item.starred)
    const changing = selected.filter((item) => item.starred === allStarred)
    await Promise.all(changing.map((item) => edits.toggleStar(item)))
    selection.clear()
  }

  const map = (
    <DayMiniMap
      baseUrl={baseUrl}
      className={narrow ? 'h-52' : 'h-56'}
      stops={stops}
      onSelectStop={scrollToStop}
    />
  )
  const chip =
    'rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-50'
  const navButton =
    'inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <section
      aria-label={dayLabel}
      className="min-w-0 bg-background pb-24 min-[760px]:pb-0"
      data-testid="day-detail-panel"
    >
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface px-3 py-2.5 min-[760px]:gap-3 min-[760px]:px-[18px] min-[760px]:py-3">
        <button className={navButton} type="button" onClick={onClose}>
          <ArrowLeft aria-hidden="true" size={16} />
          <span className="max-[759px]:sr-only">{t('dayDetail.back')}</span>
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
          <span className="min-[760px]:hidden">{dayLabel}</span>
          <span className="max-[759px]:hidden">
            {[
              crumb,
              dayNumber === null
                ? null
                : t('dayDetail.dayOf', { n: dayNumber }),
            ]
              .filter(
                (part): part is string => part !== undefined && part !== null,
              )
              .join(' · ')}
          </span>
        </span>
        <button
          aria-label={t('dayDetail.prevDay')}
          className={navButton}
          disabled={onPrev === null}
          type="button"
          onClick={onPrev ?? undefined}
        >
          <ChevronLeft aria-hidden="true" size={16} />
          <span className="max-[759px]:sr-only">{t('dayDetail.prevDay')}</span>
        </button>
        <button
          aria-label={t('dayDetail.nextDay')}
          className={navButton}
          disabled={onNext === null}
          type="button"
          onClick={onNext ?? undefined}
        >
          <span className="max-[759px]:sr-only">{t('dayDetail.nextDay')}</span>
          <ChevronRight aria-hidden="true" size={16} />
        </button>
        {cull !== undefined && canEdit && orderedMedia.length > 0 ? (
          <button
            className={cn(navButton, 'border-primary text-primary')}
            type="button"
            onClick={(event) => {
              setCullOpener(event.currentTarget)
              cull.onOpenChange(true)
            }}
          >
            <Star aria-hidden="true" size={16} />
            <span className="max-[759px]:sr-only">{t('cull.title')}</span>
          </button>
        ) : null}
      </div>

      <div className="grid min-[760px]:grid-cols-[20rem_minmax(0,1fr)]">
        {narrow ? null : (
          <aside className="sticky top-[57px] flex max-h-[calc(100svh-57px)] flex-col gap-3.5 self-start overflow-auto border-r border-border p-4">
            {map}
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
                {t('dayDetail.daysOfStage')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {days.map((day) => (
                  <button
                    aria-current={day.key === dayKey ? 'true' : undefined}
                    className={cn(
                      chip,
                      day.key === dayKey &&
                        'border-primary bg-primary-soft font-medium text-primary',
                    )}
                    key={day.key}
                    type="button"
                    onClick={() => {
                      onSelectDay(day.key)
                    }}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
                {t('dayDetail.quickEdits')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  aria-pressed={selection.mode}
                  className={chip}
                  disabled={!canEdit}
                  type="button"
                  onClick={() => {
                    if (selection.mode) selection.clear()
                    else selection.setMode(true)
                  }}
                >
                  {t('dayDetail.selectMode')}
                </button>
              </div>
            </div>
          </aside>
        )}

        <div className="min-w-0 px-3.5 py-[18px] min-[760px]:px-[26px]">
          {narrow ? (
            <div className="mb-3">
              <button
                aria-expanded={mapOpen}
                className={chip}
                type="button"
                onClick={() => {
                  setMapOpen((open) => !open)
                }}
              >
                {mapOpen ? t('dayDetail.hideMap') : t('dayDetail.showMap')}
              </button>
              {mapOpen ? <div className="mt-2">{map}</div> : null}
            </div>
          ) : null}
          <h2 className="reader-display text-[28px] leading-tight min-[760px]:text-[34px] min-[760px]:leading-[1.05]">
            {dayLabel}
          </h2>
          <p className="mt-1.5 text-sm text-muted">{meta}</p>
          <div
            className="mt-2 flex flex-wrap items-center gap-2"
            data-testid="day-status"
          >
            <DayStatusChips detail journeyId={journeyId} status={status} />
          </div>

          <DayNoteEditor
            canEdit={canEdit}
            dated={dated}
            value={notes.byDate.get(dayKey) ?? null}
            onSave={(body) => notes.save(dayKey, body)}
          />

          <DayStops
            baseUrl={baseUrl}
            canEdit={canEdit}
            edits={edits}
            locale={locale}
            mediaOrder={mediaOrder}
            selection={selection}
            renderStopMenu={renderStopMenu}
            stops={stops}
            onOpenMedia={onOpenMedia}
          />

          {canEdit && selection.mode ? (
            <SelectionBar
              allStarred={
                selected.length > 0 && selected.every((i) => i.starred)
              }
              count={selected.length}
              targets={stops.map((stop, index) => ({
                id: stop.moments[0]?.moment.id ?? stop.id,
                label: `${String(index + 1)}. ${stop.title ?? t('dayDetail.stopNumber', { n: index + 1 })}`,
              }))}
              onClear={selection.clear}
              {...(isMediaCorrectionsEnabled()
                ? {
                    onFixTimeLocation: () => {
                      setFixOpen(true)
                    },
                  }
                : {})}
              onMoveTo={(targetId) => {
                void actions.moveMedia(selected, targetId).then((ok) => {
                  if (ok) selection.clear()
                })
              }}
              onNewStop={() => {
                void actions.createStop(selected).then((ok) => {
                  if (ok) selection.clear()
                })
              }}
              onStar={() => {
                void starSelected()
              }}
              onTrash={() => {
                void edits.trashMedia(selected).then((ok) => {
                  if (ok) selection.clear()
                })
              }}
            />
          ) : null}
        </div>
      </div>
      {fixOpen && selected.length > 0 ? (
        <FixTimeLocationSheet
          items={orderedSelected}
          journeyId={journeyId}
          onClose={() => {
            setFixOpen(false)
          }}
        />
      ) : null}
      {cull?.open === true ? (
        <CullView
          baseUrl={baseUrl}
          edits={edits}
          photos={orderedMedia}
          restoreMedia={cull.restoreMedia}
          returnFocusTo={cullOpener}
          onClose={() => {
            cull.onOpenChange(false)
          }}
        />
      ) : null}
    </section>
  )
}
