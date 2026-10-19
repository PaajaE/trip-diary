import { Link } from '@tanstack/react-router'
import { ChevronDown, Hand, ImagePlus, ListTree, Lock } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useJourneyPlaces } from '@/entities/place/api/use-journey-places'
import { useCanEditJourney } from '@/features/journey-workspace/api/use-can-edit-journey'
import { useResolveMissingPlaces } from '@/features/journey-workspace/api/use-resolve-missing-places'
import { useJourneyCoverQuery } from '@/entities/journey/api/use-journey-cover-query'
import {
  useWorkspaceEdits,
  type WorkspaceEdits,
} from '@/features/journey-workspace/api/use-workspace-edits'
import {
  buildCoverTargetIndex,
  type CoverTarget,
} from '@/features/journey-workspace/model/cover-targets'
import { EditableMediaTile } from '@/features/journey-workspace/ui/EditableMediaTile'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import {
  formatCompactRange,
  formatDayLabel,
  formatInstantTime,
} from '@/features/journey-workspace/lib/format-range'
import { DEFAULT_MEDIA_BASE_URL } from '@/features/journey-workspace/lib/media-thumb'
import {
  adjacentSegmentPairs,
  boundaryCandidates,
  findAdjacentMoments,
  splitCandidates,
  type SegmentPair,
} from '@/features/journey-workspace/model/edit-candidates'
import {
  BoundaryDialog,
  DeleteMomentDialog,
  MergeDialog,
  SplitDialog,
} from '@/features/journey-workspace/ui/EditDialogs'
import {
  dayElementId,
  groupMomentsByDay,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import {
  collectMoments,
  isWorkspaceEmpty,
  type WorkspaceMoment,
  type WorkspaceSegment,
} from '@/features/journey-workspace/model/workspace-tree'
import type { MediaItem } from '@/entities/media/model/media-library'
import { scrollAndAnchor } from '@/features/journey-workspace/lib/anchor-scroll'
import { useStableByKey } from '@/features/journey-workspace/lib/use-stable-by-key'
import { useNearViewport } from '@/features/journey-workspace/lib/use-near-viewport'
import {
  buildMapModel,
  computeView,
  createHoverStore,
  estimateMomentHeight,
  type HoverStore,
  type MapView,
} from '@/features/journey-workspace/model/workspace-map'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  MediaViewer,
  type ViewerGroup,
} from '@/features/journey-workspace/ui/MediaViewer'
import {
  WorkspaceMap,
  type MapViewRequest,
} from '@/features/journey-workspace/ui/WorkspaceMap'
import {
  ClampedBody,
  MomentTextEditor,
  SegmentTextEditor,
} from '@/features/journey-workspace/ui/TextEditing'
import {
  useJourneyMomentTags,
  type JourneyMomentTags,
} from '@/features/moment-tags/api/use-moment-tags'
import {
  MomentTagsDialog,
  TagChips,
} from '@/features/moment-tags/ui/MomentTags'
import {
  OverflowMenu,
  type MenuAction,
} from '@/features/journey-workspace/ui/OverflowMenu'
import { targetTitles } from '@/features/journey-workspace/model/target-titles'
import { ModerationPanel } from '@/features/journey-workspace/ui/ModerationPanel'
import {
  momentElementId,
  segmentElementId,
} from '@/features/journey-workspace/lib/outline-ids'
import {
  LOOSE_SCOPE,
  WorkspaceOutline,
  type OutlineTarget,
} from '@/features/journey-workspace/ui/WorkspaceOutline'
import { publicEnv } from '@/shared/config/env'
import { cn } from '@/shared/lib/cn'
import { useMediaQuery } from '@/shared/lib/use-media-query'
import { buttonVariants } from '@/shared/ui/button-variants'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

const BASE_URL = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL

/** Photos shown before the "+N" tile (one grid slot is the "+N" tile). */
const GRID_LIMIT = 6

/** Moments rendered on each side of a navigation target. */
const NAV_NEIGHBOURS = 2

const BOUNDARY_BUTTON =
  'inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-muted hover:bg-surface active:bg-surface'

interface EditingContext {
  edits: WorkspaceEdits
  tags: JourneyMomentTags
  /** Every moment of the journey in start order. */
  moments: WorkspaceMoment[]
  /** Place names by place id. */
  placeNames: ReadonlyMap<string, string>
  /** Opens the full-screen viewer at a media item. */
  openViewer: (item: MediaItem, trigger: HTMLElement) => void
  /** Adjacent same-kind segment pairs keyed by the earlier segment id. */
  pairs: Map<string, SegmentPair>
  /** Media outside any moment (candidate instants for boundaries). */
  unassigned: MediaItem[]
  targets: Map<string, CoverTarget[]>
  /** Segments the user collapsed (kept in memory only). */
  collapsed: ReadonlySet<string>
  toggleCollapsed: (segmentId: string) => void
  /** Hovered moment, mirrored as a highlighted map pin. */
  hover: HoverStore
  /** Moments that must render now (navigation target and its neighbours). */
  forced: ReadonlySet<string>
  /** Bumps after a programmatic scroll ended: re-check what is near. */
  settleTick: number
}

function MediaTiles({
  editing,
  items,
}: {
  editing: EditingContext
  items: MediaItem[]
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const overflow = items.length > GRID_LIMIT
  const visible = overflow && !expanded ? items.slice(0, GRID_LIMIT - 1) : items
  const hidden = items.length - visible.length
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] lg:gap-3">
      {visible.map((item) => (
        <EditableMediaTile
          baseUrl={BASE_URL}
          edits={editing.edits}
          item={item}
          key={item.id}
          onOpen={editing.openViewer}
        />
      ))}
      {overflow && !expanded ? (
        <button
          aria-label={t('workspace.moreMediaLabel', { count: hidden })}
          className="flex aspect-square items-center justify-center rounded-sm bg-surface text-base font-semibold text-muted transition-colors hover:bg-border/60"
          type="button"
          onClick={() => {
            setExpanded(true)
          }}
        >
          +{hidden}
        </button>
      ) : null}
      {overflow && expanded ? (
        <button
          className="col-span-full min-h-11 rounded-xl text-sm font-semibold text-primary hover:bg-surface"
          type="button"
          onClick={() => {
            setExpanded(false)
          }}
        >
          {t('workspace.showFewerMedia')}
        </button>
      ) : null}
    </div>
  )
}

/** "3 trips · 41 photos · 2 videos"; empty parts are left out. */
function countsText(
  t: TFunction,
  parts: { photos: number; trips?: number; videos: number },
): string {
  const out: string[] = []
  if ((parts.trips ?? 0) > 0)
    out.push(t('terms.trip.count', { count: parts.trips }))
  if (parts.photos > 0)
    out.push(t('terms.photo.count', { count: parts.photos }))
  if (parts.videos > 0)
    out.push(t('terms.video.count', { count: parts.videos }))
  return out.join(' · ')
}

function StateIcons({ locked, manual }: { locked: boolean; manual: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      {manual ? (
        <Hand
          aria-label={t('workspace.manual')}
          className="inline shrink-0 text-muted"
          role="img"
          size={13}
        />
      ) : null}
      {locked ? (
        <Lock
          aria-label={t('workspace.locked')}
          className="inline shrink-0 text-muted"
          role="img"
          size={13}
        />
      ) : null}
    </>
  )
}

function momentTitle(
  entry: WorkspaceMoment,
  t: TFunction,
  locale: string,
): string {
  return (
    entry.moment.title ??
    t('workspace.untitledMoment', {
      time: formatInstantTime(entry.moment.startsAt, entry.tz, locale),
    })
  )
}

function MomentBlock({
  editing,
  entry,
  locale,
  onSelect,
  rail,
  selected,
}: {
  editing: EditingContext
  entry: WorkspaceMoment
  locale: string
  onSelect: (id: string) => void
  rail: boolean
  selected: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLLIElement>(null)
  // Far from the viewport only a placeholder of the estimated height renders;
  // the element and its id exist either way, so navigation can scroll to it.
  const id = entry.moment.id
  const near = useNearViewport(
    ref,
    selected || editing.forced.has(id),
    editing.settleTick,
  )
  return (
    <li
      className={cn(
        'relative scroll-mt-24 py-3 lg:-mx-3 lg:rounded-lg lg:px-3 lg:py-4 lg:transition-colors lg:hover:bg-surface/70',
        selected && '-mx-2 rounded-sm bg-primary/5 px-2 lg:bg-primary/5',
      )}
      data-placeholder={near ? undefined : 'true'}
      id={momentElementId(id)}
      ref={ref}
      style={
        near
          ? undefined
          : {
              minHeight: estimateMomentHeight(
                entry.media.length,
                entry.moment.body !== '',
                GRID_LIMIT,
              ),
            }
      }
      onMouseEnter={() => {
        editing.hover.set(id)
      }}
      onMouseLeave={() => {
        editing.hover.set(null)
      }}
    >
      {near ? (
        <MomentContent
          editing={editing}
          entry={entry}
          locale={locale}
          rail={rail}
          selected={selected}
          onSelect={onSelect}
        />
      ) : (
        <span className="block truncate font-medium text-muted">
          {momentTitle(entry, t, locale)}
        </span>
      )}
    </li>
  )
}

function MomentContent({
  editing,
  entry,
  locale,
  onSelect,
  rail,
  selected,
}: {
  editing: EditingContext
  entry: WorkspaceMoment
  locale: string
  onSelect: (id: string) => void
  /** True when the moment hangs on a timeline rail (draws a dot). */
  rail: boolean
  selected: boolean
}) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<
    'delete' | 'next' | 'previous' | 'split' | 'tags' | null
  >(null)
  const hasPoint =
    entry.moment.latitude !== null && entry.moment.longitude !== null
  const neighbours = findAdjacentMoments(editing.moments, entry.moment.id)
  const other =
    dialog === 'next'
      ? neighbours.next
      : dialog === 'previous'
        ? neighbours.previous
        : null
  const close = () => {
    setDialog(null)
  }
  const name = momentTitle(entry, t, locale)
  const actions: MenuAction[] = [
    {
      key: 'tags',
      label: t('tags.edit'),
      onSelect: () => {
        setDialog('tags')
      },
    },
    ...(neighbours.previous !== null
      ? [
          {
            key: 'previous',
            label: t('workspace.mergeWithPrevious'),
            onSelect: () => {
              setDialog('previous')
            },
          },
        ]
      : []),
    ...(neighbours.next !== null
      ? [
          {
            key: 'next',
            label: t('workspace.mergeWithNext'),
            onSelect: () => {
              setDialog('next')
            },
          },
        ]
      : []),
    {
      key: 'split',
      label: t('workspace.splitMoment'),
      onSelect: () => {
        setDialog('split')
      },
    },
    {
      key: 'delete',
      label: t('workspace.deleteMoment'),
      onSelect: () => {
        setDialog('delete')
      },
    },
  ]
  const counts = countsText(t, {
    photos: entry.photoCount,
    videos: entry.videoCount,
  })
  return (
    <>
      {rail ? (
        <span
          aria-hidden="true"
          className="absolute -left-5 top-[26px] size-2 rounded-full border border-muted bg-background lg:-left-2 lg:top-[34px]"
        />
      ) : null}
      <div className="flex items-start gap-1">
        <button
          aria-pressed={selected}
          className="min-h-11 min-w-0 flex-1 text-left"
          disabled={!hasPoint}
          title={hasPoint ? t('workspace.showOnMap') : ''}
          type="button"
          onClick={() => {
            onSelect(entry.moment.id)
          }}
        >
          <span className="flex items-center gap-1.5 font-medium lg:text-lg">
            <span className="min-w-0 truncate">{name}</span>
            <StateIcons
              locked={entry.moment.locked}
              manual={entry.moment.origin === 'manual'}
            />
          </span>
          <span className="block text-xs text-muted lg:text-sm">
            {formatCompactRange(
              entry.moment.startsAt,
              entry.moment.endsAt,
              entry.tz,
              locale,
              { withTime: true, withYear: false },
            )}
            {counts !== '' ? ` · ${counts}` : ''}
          </span>
        </button>
        <OverflowMenu actions={actions} name={name} />
      </div>
      <ClampedBody body={entry.moment.body} />
      <TagChips tags={editing.tags.byMoment.get(entry.moment.id) ?? []} />
      {entry.media.length > 0 ? (
        <MediaTiles editing={editing} items={entry.media} />
      ) : null}
      <div className="mt-1 -ml-2">
        <MomentTextEditor
          edits={editing.edits}
          moment={entry.moment}
          name={name}
        />
      </div>
      {dialog === 'tags' ? (
        <MomentTagsDialog
          momentId={entry.moment.id}
          momentName={name}
          tags={editing.tags}
          onClose={close}
        />
      ) : null}
      {other !== null ? (
        <MergeDialog
          sourceLabel={momentTitle(other, t, locale)}
          targetLabel={name}
          onClose={close}
          onConfirm={() => {
            void editing.edits
              .mergeMoments(entry.moment.id, other.moment.id)
              .then(close)
          }}
        />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteMomentDialog
          counts={counts}
          mediaCount={entry.media.length}
          name={name}
          onClose={close}
          onConfirm={(mode) => editing.edits.deleteMoment(entry.moment, mode)}
        />
      ) : null}
      {dialog === 'split' ? (
        <SplitDialog
          candidates={splitCandidates(entry)}
          locale={locale}
          tz={entry.tz}
          onClose={close}
          onConfirm={(at) => {
            void editing.edits.splitMoment(entry.moment.id, at).then(close)
          }}
        />
      ) : null}
    </>
  )
}

/** Moments of one segment (or the loose group) with a heading per local day. */
function MomentList({
  editing,
  locale,
  moments,
  rail,
  scopeId,
  selectedId,
  onSelect,
}: {
  editing: EditingContext
  locale: string
  moments: WorkspaceMoment[]
  rail: boolean
  scopeId: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const days = useMemo(() => groupMomentsByDay(moments), [moments])
  return (
    <ul className="divide-y divide-border/70">
      {days.map((day) => {
        const first = day.moments[0]
        if (first === undefined) return null
        const places = day.placeIds
          .map((id) => editing.placeNames.get(id))
          .filter((name): name is string => name !== undefined)
        const date =
          day.key === UNKNOWN_DAY
            ? t('workspace.dayUnknown')
            : formatDayLabel(first.moment.startsAt, first.tz, locale)
        return (
          <li key={day.key}>
            <h3
              className="scroll-mt-24 pt-3 text-xs font-semibold uppercase tracking-wide text-muted"
              id={dayElementId(scopeId, day.key)}
            >
              {[date, places.join(', ')].filter((p) => p !== '').join(' · ')}
            </h3>
            <ul className="divide-y divide-border/70">
              {day.moments.map((entry) => (
                <MomentBlock
                  editing={editing}
                  entry={entry}
                  key={entry.moment.id}
                  locale={locale}
                  rail={rail}
                  selected={entry.moment.id === selectedId}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}

function SegmentBlock({
  editing,
  inRail,
  locale,
  node,
  onSelect,
  selectedId,
}: {
  editing: EditingContext
  /** True when an ancestor already draws the timeline rail. */
  inRail: boolean
  locale: string
  node: WorkspaceSegment
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const { t } = useTranslation()
  const { segment } = node
  const isStage = segment.kind === 'stage'
  const termKey = isStage ? 'stage' : 'trip'
  const open = !editing.collapsed.has(segment.id)
  const suggested = segment.origin === 'suggested'
  const counts = countsText(t, {
    photos: node.photoCount,
    trips: node.children.length,
    videos: node.videoCount,
  })
  const hasContent = node.moments.length > 0 || node.children.length > 0
  const wrapper = isStage
    ? cn(
        '-mx-5 border-y px-5 py-2 sm:mx-0 sm:rounded-xl sm:border sm:px-4 lg:rounded-lg lg:px-5 lg:py-3',
        suggested
          ? 'border-dashed border-accent bg-accent/5'
          : 'border-border bg-surface',
      )
    : suggested
      ? 'rounded-xl border border-dashed border-accent bg-accent/5 px-3 py-1'
      : ''
  return (
    <section
      aria-label={segment.title}
      className="relative scroll-mt-24"
      data-kind={segment.kind}
      id={segmentElementId(segment.id)}
    >
      {inRail ? (
        <span
          aria-hidden="true"
          className="absolute -left-[21px] top-[17px] size-2.5 rounded-full bg-primary"
        />
      ) : null}
      <div className={wrapper}>
        <h2>
          <button
            aria-expanded={open}
            aria-label={t(
              open ? 'workspace.collapseSegment' : 'workspace.expandSegment',
              { name: segment.title },
            )}
            className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 text-left transition-colors lg:gap-4 lg:hover:bg-background/70"
            type="button"
            onClick={() => {
              editing.toggleCollapsed(segment.id)
            }}
          >
            {isStage && node.cover !== null ? (
              <MediaThumb
                baseUrl={BASE_URL}
                className="h-12 w-12 lg:h-16 lg:w-16"
                item={node.cover}
              />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t(`terms.${termKey}.singular`)}
              </span>
              <span
                className={`flex items-center gap-1.5 font-semibold ${isStage ? 'text-lg lg:reader-display lg:text-2xl' : 'text-base lg:text-lg'}`}
              >
                <span className="min-w-0 truncate">{segment.title}</span>
                <StateIcons
                  locked={false}
                  manual={segment.origin === 'manual'}
                />
              </span>
              <span className="block text-xs text-muted lg:text-sm">
                {formatCompactRange(
                  segment.startsAt,
                  segment.endsAt,
                  segment.tz,
                  locale,
                  { withTime: false, withYear: true },
                )}
                {counts !== '' ? ` · ${counts}` : ''}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`}
              size={20}
            />
          </button>
        </h2>
        {open ? (
          <>
            <ClampedBody body={segment.body} />
            <div className="-ml-2">
              <SegmentTextEditor edits={editing.edits} segment={segment} />
            </div>
          </>
        ) : null}
        {suggested ? (
          <div className="pb-2 pt-1">
            <p className="text-xs text-accent-strong">
              <span className="mr-1.5 rounded-full bg-accent px-2 py-0.5 font-semibold text-white">
                {t('workspace.suggestedBadge')}
              </span>
              {t('workspace.suggestionHint')}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className={cn(buttonVariants({ variant: 'primary' }), 'flex-1')}
                type="button"
                onClick={() => {
                  void editing.edits.acceptSegment(segment)
                }}
              >
                {t('workspace.acceptSuggestion')}
              </button>
              <button
                className={cn(
                  buttonVariants({ variant: 'secondary' }),
                  'flex-1',
                )}
                type="button"
                onClick={() => {
                  void editing.edits.rejectSegment(segment)
                }}
              >
                {t('workspace.rejectSuggestion')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {open && hasContent ? (
        <div
          className={inRail ? 'mt-1' : 'ml-2 mt-2 border-l border-border pl-4'}
        >
          {node.moments.length > 0 ? (
            <MomentList
              editing={editing}
              locale={locale}
              moments={node.moments}
              rail
              scopeId={segment.id}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ) : null}
          {node.children.length > 0 ? (
            <div className="mt-2 space-y-2">
              <SegmentList
                editing={editing}
                inRail
                locale={locale}
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function BoundaryControl({
  editing,
  locale,
  pair,
}: {
  editing: EditingContext
  locale: string
  pair: SegmentPair
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const before = pair.before.segment
  const after = pair.after.segment
  const close = () => {
    setOpen(false)
  }
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      <button
        aria-label={`${t('workspace.moveBoundary')}: ${before.title} / ${after.title}`}
        className={BOUNDARY_BUTTON}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('workspace.moveBoundary')}
      </button>
      <span aria-hidden="true" className="h-px flex-1 bg-border/70" />
      {open ? (
        <BoundaryDialog
          afterTitle={after.title}
          beforeTitle={before.title}
          candidates={boundaryCandidates(
            before,
            after,
            editing.moments,
            editing.unassigned,
          )}
          current={{ at: before.endsAt, tz: before.tz ?? after.tz }}
          locale={locale}
          onClose={close}
          onConfirm={(at) => {
            void editing.edits.moveBoundary(before, after, at).then(close)
          }}
        />
      ) : null}
    </div>
  )
}

function SegmentList({
  editing,
  inRail = false,
  locale,
  nodes,
  onSelect,
  selectedId,
}: {
  editing: EditingContext
  inRail?: boolean
  locale: string
  nodes: WorkspaceSegment[]
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  return (
    <>
      {nodes.map((node) => {
        const pair = editing.pairs.get(node.segment.id)
        return (
          <div className="space-y-2" key={node.segment.id}>
            <SegmentBlock
              editing={editing}
              inRail={inRail}
              locale={locale}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
            />
            {pair !== undefined ? (
              <BoundaryControl editing={editing} locale={locale} pair={pair} />
            ) : null}
          </div>
        )
      })}
    </>
  )
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

export function JourneyWorkspace({ journeyId }: { journeyId: string }) {
  const { i18n, t } = useTranslation()
  const state = useJourneyWorkspace(journeyId)
  const edits = useWorkspaceEdits(journeyId)
  const journeyCover = useJourneyCoverQuery(journeyId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [outlineOpen, setOutlineOpen] = useState(false)
  const isLg = useMediaQuery('(min-width: 1024px)')
  const isXl = useMediaQuery('(min-width: 1280px)')
  const locale = i18n.language

  const toggleCollapsed = useCallback((segmentId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(segmentId)) next.delete(segmentId)
      else next.add(segmentId)
      return next
    })
  }, [])

  const tree = state.status === 'ready' ? state.tree : null
  const mapModel = useMemo(
    () =>
      tree === null
        ? null
        : buildMapModel(tree, (entry) => momentTitle(entry, t, locale)),
    [tree, t, locale],
  )
  // Pins keep their identity while their content is equal, so unrelated edits
  // (a resolved place, a star) neither diff the markers nor move the camera.
  const pinsKey = useMemo(
    () =>
      (mapModel?.pins ?? [])
        .map(
          (p) =>
            `${p.id}|${String(p.latitude)}|${String(p.longitude)}|${p.color}|${p.label}`,
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

  const hover = useMemo(() => createHoverStore(), [])
  const requestView = useCallback(
    (ids: readonly string[] | null) => {
      setExplicitRequest((current) => ({
        nonce: (current?.nonce ?? 0) + 1,
        view: computeView(pins, ids),
      }))
    },
    [pins],
  )

  const select = useCallback(
    (id: string) => {
      setSelectedId(id)
      requestView([id])
      document
        .getElementById(momentElementId(id))
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
    [requestView],
  )

  // Moments forced to render for a navigation, and a counter that bumps when
  // the scroll has settled so lazy blocks re-check their intersection.
  const [forced, setForced] = useState<ReadonlySet<string>>(new Set())
  const [settleTick, setSettleTick] = useState(0)
  const forceAround = useCallback(
    (momentId: string | undefined) => {
      if (tree === null || momentId === undefined) return
      const ordered = collectMoments(tree)
      const at = ordered.findIndex((m) => m.moment.id === momentId)
      if (at < 0) return
      setForced(
        new Set(
          ordered
            .slice(Math.max(0, at - NAV_NEIGHBOURS), at + NAV_NEIGHBOURS + 1)
            .map((m) => m.moment.id),
        ),
      )
    },
    [tree],
  )

  const stopAnchor = useRef<(() => void) | null>(null)
  const scrollToElement = useCallback(
    (elementId: string, block: ScrollLogicalPosition) => {
      stopAnchor.current?.()
      window.setTimeout(() => {
        // Smooth scroll, then keep the target anchored while lazy blocks above
        // it render and change height; user input cancels the anchoring.
        stopAnchor.current = scrollAndAnchor(
          () => document.getElementById(elementId),
          block,
          () => {
            setSettleTick((n) => n + 1)
            setForced(new Set())
          },
        )
      }, 0)
    },
    [],
  )

  const openSegments = useCallback((expand: readonly string[]) => {
    setCollapsed((current) => {
      if (!expand.some((id) => current.has(id))) return current
      const next = new Set(current)
      for (const id of expand) next.delete(id)
      return next
    })
  }, [])

  const goTo = useCallback(
    (target: OutlineTarget) => {
      // Open the stage (and parents) first, then scroll once it is rendered.
      openSegments(target.expand)
      if (target.momentId !== undefined) setSelectedId(target.momentId)
      const scope = mapModel?.scopes.get(target.elementId) ?? null
      requestView(scope)
      forceAround(target.momentId ?? scope?.[0])
      scrollToElement(target.elementId, 'start')
    },
    [forceAround, mapModel, openSegments, requestView, scrollToElement],
  )

  // A pin: open its sections, highlight and scroll to the moment (the map
  // stays where the user put it).
  const selectFromMap = useCallback(
    (id: string) => {
      openSegments(mapModel?.expandFor.get(id) ?? [])
      setSelectedId(id)
      forceAround(id)
      scrollToElement(momentElementId(id), 'center')
    },
    [forceAround, mapModel, openSegments, scrollToElement],
  )

  const [viewer, setViewer] = useState<{
    opener: HTMLElement
    startId: string
  } | null>(null)
  const openViewer = useCallback((item: MediaItem, trigger: HTMLElement) => {
    setViewer({ opener: trigger, startId: item.id })
  }, [])
  const closeViewer = useCallback(() => {
    setViewer(null)
  }, [])

  const journeyCoverId = journeyCover.data ?? null
  const momentIds = useMemo(
    () => (tree === null ? [] : collectMoments(tree).map((m) => m.moment.id)),
    [tree],
  )
  const tags = useJourneyMomentTags(journeyId, momentIds)
  const allMoments = useMemo(
    () => (tree === null ? [] : collectMoments(tree).map((m) => m.moment)),
    [tree],
  )
  const placeIds = useMemo(
    () => [
      ...new Set(
        allMoments.flatMap((m) => (m.placeId === null ? [] : [m.placeId])),
      ),
    ],
    [allMoments],
  )
  const places = useJourneyPlaces(journeyId, placeIds)
  const placeNames = useMemo(
    () => new Map([...places].map(([id, place]) => [id, place.name])),
    [places],
  )
  // Read-only members must never call resolve-place (it writes place rows).
  const { canEdit } = useCanEditJourney(journeyId)
  const placeProgress = useResolveMissingPlaces(
    journeyId,
    allMoments,
    tree !== null && canEdit,
  )
  const editing = useMemo<EditingContext | null>(
    () =>
      tree === null
        ? null
        : {
            collapsed,
            edits,
            forced,
            hover,
            settleTick,
            moments: collectMoments(tree),
            openViewer,
            placeNames,
            tags,
            pairs: new Map(
              adjacentSegmentPairs(tree).map((p) => [p.before.segment.id, p]),
            ),
            targets: buildCoverTargetIndex(tree, journeyId, journeyCoverId),
            toggleCollapsed,
            unassigned: tree.unassigned,
          },
    [
      collapsed,
      edits,
      forced,
      hover,
      openViewer,
      placeNames,
      settleTick,
      tags,
      toggleCollapsed,
      tree,
      journeyId,
      journeyCoverId,
    ],
  )
  const viewerGroups = useMemo<ViewerGroup[]>(() => {
    if (tree === null) return []
    const out: ViewerGroup[] = []
    for (const entry of collectMoments(tree)) {
      if (entry.media.length === 0) continue
      out.push({
        id: entry.moment.id,
        items: entry.media,
        title: momentTitle(entry, t, locale),
      })
    }
    if (tree.unassigned.length > 0)
      out.push({
        id: 'unassigned',
        items: tree.unassigned,
        title: t('workspace.unassigned'),
      })
    return out
  }, [tree, t, locale])
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
  } else if (editing !== null) {
    const ready = state.tree
    const outline = (
      <WorkspaceOutline
        observeKey={collapsed}
        placeNames={placeNames}
        tree={ready}
        onNavigate={goTo}
      />
    )
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[14rem_minmax(0,1fr)_26rem] xl:gap-8 2xl:grid-cols-[15rem_minmax(0,64rem)_minmax(28rem,1fr)]">
        {isXl ? (
          <aside className="sticky top-20 max-h-[calc(100vh-6rem)] self-start overflow-y-auto">
            <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('owner.outline')}
            </h2>
            {outline}
          </aside>
        ) : null}
        <div
          aria-label={t('workspace.timeline')}
          className="min-w-0 space-y-3 lg:text-base"
        >
          {isLg && !isXl ? (
            <div>
              <button
                aria-expanded={outlineOpen}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-surface"
                type="button"
                onClick={() => {
                  setOutlineOpen((value) => !value)
                }}
              >
                <ListTree aria-hidden="true" size={16} />
                {t(outlineOpen ? 'owner.outlineHide' : 'owner.outlineShow')}
              </button>
              {outlineOpen ? (
                <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-2">
                  {outline}
                </div>
              ) : null}
            </div>
          ) : null}
          <SegmentList
            editing={editing}
            locale={locale}
            nodes={ready.roots}
            selectedId={selectedId}
            onSelect={select}
          />
          {ready.looseMoments.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {t('workspace.looseMoments')}
              </h2>
              <MomentList
                editing={editing}
                locale={locale}
                moments={ready.looseMoments}
                rail={false}
                scopeId={LOOSE_SCOPE}
                selectedId={selectedId}
                onSelect={select}
              />
            </section>
          ) : null}
          {ready.unassigned.length > 0 ? (
            <section
              className="rounded-lg border border-dashed border-border p-3"
              data-testid="unassigned-group"
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
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <h2 className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-muted lg:block">
            {t('workspace.mapHeading')}
          </h2>
          {pins.length > 0 ? (
            <WorkspaceMap
              hover={hover}
              pins={pins}
              request={mapRequest}
              selectedId={selectedId}
              onReset={() => {
                requestView(null)
              }}
              onSelect={selectFromMap}
            />
          ) : (
            <p className="rounded-lg border border-border p-4 text-sm text-muted">
              {t('workspace.noMapPoints')}
            </p>
          )}
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
      {viewer !== null && editing !== null ? (
        <MediaViewer
          baseUrl={BASE_URL}
          edits={edits}
          groups={viewerGroups}
          locale={locale}
          returnFocusTo={viewer.opener}
          startId={viewer.startId}
          targets={editing.targets}
          onClose={closeViewer}
          onDelete={(item) => {
            void edits.trashMedia([item])
          }}
        />
      ) : null}
    </div>
  )
}
