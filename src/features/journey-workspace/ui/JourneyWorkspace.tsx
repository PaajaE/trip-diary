import { Link, useNavigate } from '@tanstack/react-router'
import { ImagePlus, Map as MapIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useDayNotes } from '@/entities/day-note/api/use-day-notes'
import { browserZone } from '@/features/journey-workspace/lib/format-range'
import {
  rememberOverview,
  takeOverview,
} from '@/features/journey-workspace/lib/overview-scroll'
import { segmentElementId } from '@/features/journey-workspace/lib/outline-ids'
import { useStableByKey } from '@/features/journey-workspace/lib/use-stable-by-key'
import {
  buildBubbleModel,
  buildMapModel,
  computeFocus,
  computeView,
  formatDayCaption,
  NO_BUBBLES,
  type MapView,
} from '@/features/journey-workspace/model/workspace-map'
import {
  buildOverview,
  type OverviewDay,
} from '@/features/journey-workspace/model/workspace-overview'
import { isWorkspaceEmpty } from '@/features/journey-workspace/model/workspace-tree'
import { targetTitles } from '@/features/journey-workspace/model/target-titles'
import { BoundaryControl } from '@/features/journey-workspace/ui/BoundaryControl'
import { ChapterSection } from '@/features/journey-workspace/ui/DayCards'
import {
  BASE_URL,
  pinLabel,
} from '@/features/journey-workspace/lib/moment-labels'
import { MediaTiles } from '@/features/journey-workspace/ui/moment-blocks'
import { ModerationPanel } from '@/features/journey-workspace/ui/ModerationPanel'
import {
  OverviewTaskBar,
  type TaskId,
} from '@/features/journey-workspace/ui/OverviewTaskBar'
import {
  DayStrip,
  StageChips,
  StageRail,
} from '@/features/journey-workspace/ui/StageRail'
import {
  WorkspaceMap,
  type MapViewRequest,
} from '@/features/journey-workspace/ui/WorkspaceMap'
import { SessionViewer } from '@/features/journey-workspace/ui/SessionViewer'
import { useWorkspaceSession } from '@/features/journey-workspace/ui/workspace-session'
import { cn } from '@/shared/lib/cn'
import { useMediaQuery } from '@/shared/lib/use-media-query'
import { buttonVariants } from '@/shared/ui/button-variants'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

function scrollToElement(element: Element | null | undefined): void {
  if (element === null || element === undefined) return
  const calm =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  element.scrollIntoView({
    behavior: calm ? 'auto' : 'smooth',
    block: 'start',
  })
}

function Skeleton() {
  return (
    <div
      aria-busy="true"
      className="animate-pulse space-y-3"
      data-testid="workspace-skeleton"
    >
      <div className="h-16 rounded-xl bg-surface" />
      <div className="h-16 rounded-xl bg-surface" />
      <div className="h-16 rounded-xl bg-surface" />
    </div>
  )
}

/**
 * Overview of the owner workspace: task bar, stage rail, day cards grouped by
 * stage and the map. Days open on their own page (`.../workspace/day/<date>`).
 */
export function JourneyWorkspace({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const session = useWorkspaceSession(journeyId)
  const { editing, locale, placeNames, placeProgress, state, tree } = session
  const isDesktop = useMediaQuery('(min-width: 1100px)')
  const hasRail = useMediaQuery('(min-width: 760px)')
  const [mapOpen, setMapOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoverDay, setHoverDay] = useState<OverviewDay | null>(null)

  const notes = useDayNotes(journeyId)
  const noteDays = useMemo(() => new Set(notes.byDate.keys()), [notes.byDate])
  const overview = useMemo(
    () =>
      tree === null
        ? null
        : buildOverview(
            tree,
            (id) => placeNames.get(id),
            browserZone(),
            noteDays,
          ),
    [tree, placeNames, noteDays],
  )
  const mapModel = useMemo(
    () =>
      tree === null
        ? null
        : buildMapModel(tree, (entry) => pinLabel(entry, placeNames, locale)),
    [tree, placeNames, locale],
  )
  const freshBubbles = useMemo(
    () => (tree === null ? NO_BUBBLES : buildBubbleModel(tree, BASE_URL)),
    [tree],
  )
  // Same covers and positions keep the same object, so markers are not diffed.
  const bubbles = useStableByKey(
    freshBubbles,
    JSON.stringify([[...freshBubbles.moments], freshBubbles.stages]),
  )
  const stageMomentIds = useMemo(
    () =>
      new Map(
        bubbles.stages.map((stage) => [
          stage.id,
          mapModel?.scopes.get(segmentElementId(stage.id)) ?? [],
        ]),
      ),
    [bubbles, mapModel],
  )
  // Pins keep their identity while their content is equal, so unrelated edits
  // (a resolved place, a star) neither diff the markers nor move the camera.
  const pinsKey = useMemo(
    () =>
      (mapModel?.pins ?? [])
        .map(
          (p) =>
            `${p.id}|${String(p.latitude)}|${String(p.longitude)}|${p.label}`,
        )
        .join('\n'),
    [mapModel],
  )
  const pins = useStableByKey(mapModel?.pins ?? [], pinsKey)
  // The whole-journey view is computed once, when pins first exist.
  const [initialView, setInitialView] = useState<MapView | null>(null)
  if (initialView === null && pins.length > 0)
    setInitialView(computeView(pins, null))
  const [explicitRequest, setExplicitRequest] = useState<MapViewRequest | null>(
    null,
  )
  const mapRequest = useMemo<MapViewRequest>(
    () => explicitRequest ?? { nonce: 0, view: initialView },
    [explicitRequest, initialView],
  )
  const requestView = useCallback(
    (ids: readonly string[] | null) => {
      setExplicitRequest((current) => ({
        nonce: (current?.nonce ?? 0) + 1,
        view: computeView(pins, ids),
      }))
    },
    [pins],
  )

  // Hovering a day card lights up that day's stops on the map; the camera
  // stays where it is (the overview shows stage bubbles).
  const focusIds = hoverDay?.momentIds ?? null
  const focus = useStableByKey(
    computeFocus(pins, focusIds),
    `${pinsKey}#${focusIds?.join(',') ?? '-'}`,
  )
  const mapCaption = useMemo(() => {
    if (hoverDay === null || focus.numbers.size === 0) return null
    const places = t('workspace.mapPlaces', { count: focus.numbers.size })
    const date = formatDayCaption(hoverDay.key, locale)
    return date === null ? places : `${date} · ${places}`
  }, [focus, hoverDay, locale, t])

  const goToDay = useCallback(
    (date: string, cull = false) => {
      rememberOverview(journeyId, window.scrollY, date)
      void navigate({
        params: { date, journeyId },
        search: cull ? { cull: true } : {},
        to: '/j/$journeyId/workspace/day/$date',
      })
    },
    [journeyId, navigate],
  )
  const rememberDay = useCallback(
    (day: OverviewDay) => {
      rememberOverview(journeyId, window.scrollY, day.key)
    },
    [journeyId],
  )

  // Coming back from a day: same scroll position, visited card in view.
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (restored.current || overview === null) return
    restored.current = true
    const saved = takeOverview(journeyId)
    if (saved === null) return
    window.scrollTo(0, saved.scrollY)
    const card = [...document.querySelectorAll('[data-day-card]')].find(
      (el) => el.getAttribute('data-day-card') === saved.dayKey,
    )
    if (card === undefined) return
    const box = card.getBoundingClientRect()
    if (box.top < 0 || box.bottom > window.innerHeight)
      card.scrollIntoView({ block: 'center' })
  }, [journeyId, overview])

  const jumpToChapter = useCallback(
    (chapterId: string) => {
      const chapter = overview?.chapters.find((c) => c.id === chapterId)
      if (chapter === undefined) return
      setActiveId(chapterId)
      scrollToElement(document.getElementById(chapter.elementId))
      if (chapter.kind !== 'loose')
        requestView(mapModel?.scopes.get(segmentElementId(chapterId)) ?? null)
    },
    [mapModel, overview, requestView],
  )
  const jumpToDay = useCallback((dayKey: string) => {
    scrollToElement(
      [...document.querySelectorAll('[data-day-card]')].find(
        (el) => el.getAttribute('data-day-card') === dayKey,
      ),
    )
  }, [])

  // The rail highlights the chapter that is on screen.
  const chapterCount = overview?.chapters.length ?? 0
  useEffect(() => {
    if (chapterCount === 0 || typeof IntersectionObserver === 'undefined')
      return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-chapter-id')
          if (entry.isIntersecting && id !== null) setActiveId(id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    for (const el of document.querySelectorAll('[data-chapter-id]'))
      observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [chapterCount])

  const openTask = useCallback(
    (task: TaskId) => {
      if (overview === null) return
      const { tasks } = overview
      switch (task) {
        case 'suggestions': {
          const id = tasks.suggestions.firstSegmentId
          const element =
            id === null ? null : document.getElementById(segmentElementId(id))
          scrollToElement(element)
          element?.querySelector<HTMLElement>('[data-accept]')?.focus({
            preventScroll: true,
          })
          break
        }
        case 'noText':
          if (tasks.daysWithoutText.firstDay !== null)
            goToDay(tasks.daysWithoutText.firstDay)
          break
        case 'toCull':
          if (tasks.daysToCull.firstDay !== null)
            goToDay(tasks.daysToCull.firstDay, true)
          break
        case 'noTime':
          if (tasks.mediaWithoutTime.unassigned)
            scrollToElement(document.getElementById('ws-unassigned'))
          else if (tasks.mediaWithoutTime.firstDay !== null)
            goToDay(tasks.mediaWithoutTime.firstDay)
          break
      }
    },
    [goToDay, overview],
  )

  const selectPin = useCallback(
    (momentId: string) => {
      const day = overview?.dayOfMoment.get(momentId)
      if (day !== undefined) goToDay(day)
    },
    [goToDay, overview],
  )

  const mapElement =
    pins.length > 0 ? (
      <WorkspaceMap
        bubbles={bubbles}
        caption={mapCaption}
        focus={focus}
        hover={session.hover}
        showZoomDay={false}
        onZoomDay={() => undefined}
        pins={pins}
        request={mapRequest}
        selectedId={null}
        onReset={() => {
          requestView(null)
        }}
        stageMomentIds={stageMomentIds}
        onSelect={selectPin}
        onSelectStage={jumpToChapter}
      />
    ) : (
      <p className="rounded-lg border border-border p-4 text-sm text-muted">
        {t('workspace.noMapPoints')}
      </p>
    )

  let body: React.ReactNode = null
  if (state.status === 'loading') {
    body = <Skeleton />
  } else if (state.status === 'error') {
    body = (
      <div role="alert">
        <p>{t('workspace.loadError')}</p>
        <button
          className={cn(buttonVariants({ variant: 'secondary' }), 'mt-3')}
          type="button"
          onClick={state.retry}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  } else if (isWorkspaceEmpty(state.tree)) {
    body = (
      <EmptyState
        action={
          <Link
            className={buttonVariants({ variant: 'primary' })}
            params={{ journeyId }}
            to="/j/$journeyId/import"
          >
            {t('workspace.import')}
          </Link>
        }
        description={t('workspace.emptyJourney')}
        icon={ImagePlus}
        title={t('workspace.emptyTitle')}
      />
    )
  } else if (editing !== null && overview !== null) {
    const ready = state.tree
    const stageCount = overview.chapters.filter(
      (c) => c.kind === 'stage',
    ).length
    const photoTotal =
      overview.chapters.reduce((sum, c) => sum + c.photoCount, 0) +
      ready.unassigned.filter((item) => item.kind === 'photo').length
    const summary = [
      stageCount > 0 ? t('terms.stage.count', { count: stageCount }) : null,
      t('workspace.daysCount', { count: overview.days.length }),
      photoTotal > 0 ? t('terms.photo.count', { count: photoTotal }) : null,
    ]
      .filter((part) => part !== null)
      .join(' · ')
    body = (
      <div
        className="overflow-clip rounded-[18px] border border-border bg-background shadow-soft"
        data-testid="workspace-overview"
      >
        <OverviewTaskBar tasks={overview.tasks} onOpen={openTask} />
        <div className="grid min-[760px]:grid-cols-[200px_minmax(0,1fr)] min-[1100px]:grid-cols-[220px_minmax(0,1fr)_340px]">
          {hasRail ? (
            <nav
              aria-label={t('workspace.overview.stages')}
              className="border-r border-border px-2.5 py-4"
            >
              <div className="sticky top-20 max-h-[calc(100svh-6rem)] overflow-y-auto">
                <StageRail
                  activeId={activeId}
                  chapters={overview.chapters}
                  locale={locale}
                  onJump={jumpToChapter}
                />
                <DayStrip days={overview.strip} onJump={jumpToDay} />
              </div>
            </nav>
          ) : null}
          <div
            aria-label={t('workspace.timeline')}
            className="min-w-0 px-5 py-4 sm:px-6"
            role="region"
          >
            {hasRail ? null : (
              <div className="mb-4">
                <StageChips
                  activeId={activeId}
                  chapters={overview.chapters}
                  onJump={jumpToChapter}
                />
              </div>
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">{summary}</p>
              {isDesktop ? null : (
                <button
                  aria-expanded={mapOpen}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                  type="button"
                  onClick={() => {
                    setMapOpen((open) => !open)
                  }}
                >
                  <MapIcon aria-hidden="true" size={16} />
                  {t('workspace.overview.mapToggle')}
                </button>
              )}
            </div>
            {!isDesktop && mapOpen ? (
              <div className="mb-5">{mapElement}</div>
            ) : null}
            {overview.chapters.map((chapter) => {
              const pair = editing.pairs.get(chapter.id)
              return (
                <div key={chapter.id}>
                  <ChapterSection
                    chapter={chapter}
                    editing={editing}
                    journeyId={journeyId}
                    locale={locale}
                    onHoverDay={setHoverDay}
                    onOpenDay={rememberDay}
                  />
                  {pair === undefined ? null : (
                    <div className="mb-5 -mt-3">
                      <BoundaryControl
                        editing={editing}
                        locale={locale}
                        pair={pair}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            {ready.unassigned.length > 0 ? (
              <section
                className="scroll-mt-24 rounded-lg border border-dashed border-border p-3"
                data-testid="unassigned-group"
                id="ws-unassigned"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {t('workspace.unassigned')}
                </h2>
                <p className="text-xs text-muted">
                  {t('workspace.unassignedHint')}
                </p>
                <MediaTiles editing={editing} items={ready.unassigned} />
              </section>
            ) : null}
          </div>
          {isDesktop ? (
            <aside className="border-l border-border p-3.5">
              <div className="sticky top-20">
                <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  {t('workspace.mapHeading')}
                </h2>
                {mapElement}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24 sm:pb-0">
      <div className="mb-4">
        <ModerationPanel
          journeyId={journeyId}
          titles={tree === null ? new Map() : targetTitles(tree)}
        />
      </div>
      {placeProgress !== null ? (
        <p aria-live="polite" className="mb-3 text-xs text-muted" role="status">
          {t('workspace.resolvingPlaces', {
            done: placeProgress.done,
            total: placeProgress.total,
          })}
        </p>
      ) : null}
      {body}
      {placeNames.size > 0 ? (
        <p className="mt-6 text-muted">
          <PlaceAttribution />
        </p>
      ) : null}
      <SessionViewer session={session} />
    </div>
  )
}
