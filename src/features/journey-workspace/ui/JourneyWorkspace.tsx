import { Link } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  formatInstantTime,
  formatRange,
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
  MergeDialog,
  SplitDialog,
} from '@/features/journey-workspace/ui/EditDialogs'
import {
  collectMoments,
  isWorkspaceEmpty,
  type WorkspaceMoment,
  type WorkspaceSegment,
} from '@/features/journey-workspace/model/workspace-tree'
import type { MediaItem } from '@/entities/media/model/media-library'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import {
  WorkspaceMap,
  type WorkspaceMapPoint,
} from '@/features/journey-workspace/ui/WorkspaceMap'
import {
  ClampedBody,
  MomentTextEditor,
  SegmentTextEditor,
} from '@/features/journey-workspace/ui/TextEditing'
import { OrganizeJourneyButton } from '@/features/journey-organize/ui/OrganizeJourneyButton'
import { publicEnv } from '@/shared/config/env'

const BASE_URL = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL

const ACTION_BUTTON =
  'min-h-10 min-w-10 rounded-md border border-border px-3 py-1.5 text-sm font-semibold'

interface EditingContext {
  edits: WorkspaceEdits
  /** Every moment of the journey in start order. */
  moments: WorkspaceMoment[]
  /** Adjacent same-kind segment pairs keyed by the earlier segment id. */
  pairs: Map<string, SegmentPair>
  /** Media outside any moment (candidate instants for boundaries). */
  unassigned: MediaItem[]
  targets: Map<string, CoverTarget[]>
}

function MediaTiles({
  editing,
  items,
}: {
  editing: EditingContext
  items: MediaItem[]
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((item) => (
        <EditableMediaTile
          baseUrl={BASE_URL}
          edits={editing.edits}
          item={item}
          key={item.id}
          targets={editing.targets.get(item.id) ?? []}
        />
      ))}
    </div>
  )
}

function Counts({ photos, videos }: { photos: number; videos: number }) {
  const { t } = useTranslation()
  return (
    <span className="text-xs text-muted">
      {photos > 0 ? t('terms.photo.count', { count: photos }) : null}
      {photos > 0 && videos > 0 ? ' · ' : null}
      {videos > 0 ? t('terms.video.count', { count: videos }) : null}
    </span>
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

function MomentCard({
  editing,
  entry,
  locale,
  onSelect,
  selected,
}: {
  editing: EditingContext
  entry: WorkspaceMoment
  locale: string
  onSelect: (id: string) => void
  selected: boolean
}) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<'next' | 'previous' | 'split' | null>(
    null,
  )
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
  return (
    <li
      className={`rounded-lg border p-3 ${selected ? 'border-primary bg-surface' : 'border-border'}`}
      id={`ws-moment-${entry.moment.id}`}
    >
      <button
        aria-pressed={selected}
        className="flex w-full items-start gap-3 text-left"
        disabled={!hasPoint}
        title={hasPoint ? t('workspace.showOnMap') : ''}
        type="button"
        onClick={() => {
          onSelect(entry.moment.id)
        }}
      >
        {entry.cover !== null ? (
          <MediaThumb baseUrl={BASE_URL} item={entry.cover} />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase text-muted">
            {t('terms.moment.singular')}
          </span>
          <span className="block font-medium">
            {momentTitle(entry, t, locale)}
          </span>
          <span className="block text-xs text-muted">
            {formatRange(
              entry.moment.startsAt,
              entry.moment.endsAt,
              entry.tz,
              locale,
              { withTime: true },
            )}
          </span>
          <Counts photos={entry.photoCount} videos={entry.videoCount} />
        </span>
      </button>
      <ClampedBody body={entry.moment.body} />
      {entry.media.length > 0 ? (
        <MediaTiles editing={editing} items={entry.media} />
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <MomentTextEditor
          edits={editing.edits}
          moment={entry.moment}
          name={momentTitle(entry, t, locale)}
        />
        {neighbours.previous !== null ? (
          <button
            className={ACTION_BUTTON}
            type="button"
            onClick={() => {
              setDialog('previous')
            }}
          >
            {t('workspace.mergeWithPrevious')}
          </button>
        ) : null}
        {neighbours.next !== null ? (
          <button
            className={ACTION_BUTTON}
            type="button"
            onClick={() => {
              setDialog('next')
            }}
          >
            {t('workspace.mergeWithNext')}
          </button>
        ) : null}
        <button
          className={ACTION_BUTTON}
          type="button"
          onClick={() => {
            setDialog('split')
          }}
        >
          {t('workspace.splitMoment')}
        </button>
      </div>
      {other !== null ? (
        <MergeDialog
          sourceLabel={momentTitle(other, t, locale)}
          targetLabel={momentTitle(entry, t, locale)}
          onClose={close}
          onConfirm={() => {
            void editing.edits
              .mergeMoments(entry.moment.id, other.moment.id)
              .then(close)
          }}
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
    </li>
  )
}

function SegmentBlock({
  editing,
  locale,
  node,
  onSelect,
  selectedId,
}: {
  editing: EditingContext
  locale: string
  node: WorkspaceSegment
  onSelect: (id: string) => void
  selectedId: string | null
}) {
  const { t } = useTranslation()
  const { segment } = node
  const termKey = segment.kind === 'stage' ? 'stage' : 'trip'
  return (
    <section
      aria-label={segment.title}
      className="rounded-xl border border-border p-4"
      data-kind={segment.kind}
    >
      <header className="flex items-start gap-3">
        {node.cover !== null ? (
          <MediaThumb
            baseUrl={BASE_URL}
            className="h-20 w-20"
            item={node.cover}
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted">
            {t(`terms.${termKey}.singular`)}
          </p>
          <h2 className="text-lg font-semibold">{segment.title}</h2>
          <p className="text-sm text-muted">
            {formatRange(segment.startsAt, segment.endsAt, segment.tz, locale, {
              withTime: segment.kind === 'trip',
            })}
          </p>
          <Counts photos={node.photoCount} videos={node.videoCount} />
          <ClampedBody body={segment.body} />
          <div className="mt-2">
            <SegmentTextEditor edits={editing.edits} segment={segment} />
          </div>
          {segment.origin === 'suggested' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold">
                {t('workspace.suggestedBadge')}
              </span>
              <button
                className={ACTION_BUTTON}
                type="button"
                onClick={() => {
                  void editing.edits.acceptSegment(segment)
                }}
              >
                {t('workspace.acceptSuggestion')}
              </button>
              <button
                className={ACTION_BUTTON}
                type="button"
                onClick={() => {
                  void editing.edits.rejectSegment(segment)
                }}
              >
                {t('workspace.rejectSuggestion')}
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {node.moments.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {node.moments.map((entry) => (
            <MomentCard
              editing={editing}
              entry={entry}
              key={entry.moment.id}
              locale={locale}
              selected={entry.moment.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
      {node.children.length > 0 ? (
        <div className="mt-3 space-y-3 border-l border-border pl-3">
          <SegmentList
            editing={editing}
            locale={locale}
            nodes={node.children}
            selectedId={selectedId}
            onSelect={onSelect}
          />
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
    <div className="flex justify-center">
      <button
        aria-label={`${t('workspace.moveBoundary')}: ${before.title} / ${after.title}`}
        className={ACTION_BUTTON}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        {t('workspace.moveBoundary')}
      </button>
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
  locale,
  nodes,
  onSelect,
  selectedId,
}: {
  editing: EditingContext
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
          <div className="space-y-3" key={node.segment.id}>
            <SegmentBlock
              editing={editing}
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
      <div className="h-24 rounded-xl bg-surface" />
      <div className="h-24 rounded-xl bg-surface" />
      <div className="h-24 rounded-xl bg-surface" />
    </div>
  )
}

export function JourneyWorkspace({ journeyId }: { journeyId: string }) {
  const { i18n, t } = useTranslation()
  const state = useJourneyWorkspace(journeyId)
  const edits = useWorkspaceEdits(journeyId)
  const journeyCover = useJourneyCoverQuery(journeyId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const locale = i18n.language

  const select = useCallback((id: string) => {
    setSelectedId(id)
    document
      .getElementById(`ws-moment-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const tree = state.status === 'ready' ? state.tree : null
  const journeyCoverId = journeyCover.data ?? null
  const editing = useMemo<EditingContext | null>(
    () =>
      tree === null
        ? null
        : {
            edits,
            moments: collectMoments(tree),
            pairs: new Map(
              adjacentSegmentPairs(tree).map((p) => [p.before.segment.id, p]),
            ),
            targets: buildCoverTargetIndex(tree, journeyId, journeyCoverId),
            unassigned: tree.unassigned,
          },
    [edits, tree, journeyId, journeyCoverId],
  )
  const points = useMemo<WorkspaceMapPoint[]>(() => {
    if (tree === null) return []
    const out: WorkspaceMapPoint[] = []
    for (const entry of collectMoments(tree)) {
      const { latitude, longitude } = entry.moment
      if (latitude === null || longitude === null) continue
      out.push({
        id: entry.moment.id,
        label: momentTitle(entry, t, locale),
        latitude,
        longitude,
      })
    }
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
          className="mt-3 rounded-md border border-border px-3 py-1.5 font-semibold"
          type="button"
          onClick={state.retry}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  } else if (isWorkspaceEmpty(state.tree)) {
    body = <p className="text-muted">{t('workspace.emptyJourney')}</p>
  } else if (editing !== null) {
    const ready = state.tree
    body = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div aria-label={t('workspace.timeline')} className="space-y-4">
          <SegmentList
            editing={editing}
            locale={locale}
            nodes={ready.roots}
            selectedId={selectedId}
            onSelect={select}
          />
          {ready.looseMoments.length > 0 ? (
            <section className="rounded-xl border border-border p-4">
              <h2 className="font-semibold">{t('workspace.looseMoments')}</h2>
              <ul className="mt-3 space-y-2">
                {ready.looseMoments.map((entry) => (
                  <MomentCard
                    editing={editing}
                    entry={entry}
                    key={entry.moment.id}
                    locale={locale}
                    selected={entry.moment.id === selectedId}
                    onSelect={select}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {ready.unassigned.length > 0 ? (
            <section
              className="rounded-xl border border-dashed border-border p-4"
              data-testid="unassigned-group"
            >
              <h2 className="font-semibold">{t('workspace.unassigned')}</h2>
              <p className="text-sm text-muted">
                {t('workspace.unassignedHint')}
              </p>
              <MediaTiles editing={editing} items={ready.unassigned} />
            </section>
          ) : null}
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          {points.length > 0 ? (
            <WorkspaceMap
              points={points}
              selectedId={selectedId}
              onSelect={select}
            />
          ) : (
            <p className="rounded-lg border border-border p-4 text-muted">
              {t('workspace.noMapPoints')}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('workspace.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex min-h-10 items-center rounded-md border border-border px-3 py-1.5 text-sm font-semibold"
            params={{ journeyId }}
            to="/j/$journeyId/import"
          >
            {t('mediaImport.link')}
          </Link>
          <OrganizeJourneyButton journeyId={journeyId} />
        </div>
      </div>
      <p className="mb-6 text-sm text-muted">{t('workspace.subtitle')}</p>
      {body}
    </main>
  )
}
