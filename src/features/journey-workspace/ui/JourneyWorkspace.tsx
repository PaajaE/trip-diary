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
import { publicEnv } from '@/shared/config/env'

const BASE_URL = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL

interface EditingContext {
  edits: WorkspaceEdits
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
  const hasPoint =
    entry.moment.latitude !== null && entry.moment.longitude !== null
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
      {entry.media.length > 0 ? (
        <MediaTiles editing={editing} items={entry.media} />
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
          {node.children.map((child) => (
            <SegmentBlock
              editing={editing}
              key={child.segment.id}
              locale={locale}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </section>
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
            targets: buildCoverTargetIndex(tree, journeyId, journeyCoverId),
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
          {ready.roots.map((node) => (
            <SegmentBlock
              editing={editing}
              key={node.segment.id}
              locale={locale}
              node={node}
              selectedId={selectedId}
              onSelect={select}
            />
          ))}
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
      <h1 className="text-2xl font-semibold">{t('workspace.title')}</h1>
      <p className="mb-6 text-sm text-muted">{t('workspace.subtitle')}</p>
      {body}
    </main>
  )
}
