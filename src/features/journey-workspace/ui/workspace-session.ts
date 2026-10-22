import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useJourneyCoverQuery } from '@/entities/journey/api/use-journey-cover-query'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useJourneyPlaces } from '@/entities/place/api/use-journey-places'
import { useCanEditJourney } from '@/features/journey-workspace/api/use-can-edit-journey'
import {
  useJourneyWorkspace,
  type JourneyWorkspaceState,
} from '@/features/journey-workspace/api/use-journey-workspace'
import { useResolveMissingPlaces } from '@/features/journey-workspace/api/use-resolve-missing-places'
import {
  useWorkspaceEdits,
  type WorkspaceEdits,
} from '@/features/journey-workspace/api/use-workspace-edits'
import { buildCoverTargetIndex } from '@/features/journey-workspace/model/cover-targets'
import { adjacentSegmentPairs } from '@/features/journey-workspace/model/edit-candidates'
import {
  createHoverStore,
  type HoverStore,
} from '@/features/journey-workspace/model/workspace-map'
import {
  collectMoments,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'
import { momentTitle } from '@/features/journey-workspace/lib/moment-labels'
import type { EditingContext } from '@/features/journey-workspace/ui/moment-blocks'
import type { ViewerGroup } from '@/features/journey-workspace/ui/MediaViewer'
import { useJourneyMomentTags } from '@/features/moment-tags/api/use-moment-tags'

export interface WorkspaceSession {
  /** The user may edit this journey (viewers see no editing controls). */
  canEdit: boolean
  /** Null until the tree is ready. */
  editing: EditingContext | null
  edits: WorkspaceEdits
  hover: HoverStore
  locale: string
  /** Progress of the background place lookup, null when idle. */
  placeProgress: ReturnType<typeof useResolveMissingPlaces>
  placeNames: ReadonlyMap<string, string>
  state: JourneyWorkspaceState
  tree: WorkspaceTree | null
  viewer: { opener: HTMLElement; startId: string } | null
  viewerGroups: ViewerGroup[]
  closeViewer: () => void
}

/**
 * Data and editing plumbing shared by the overview and the day page: the
 * workspace tree, edits, place names, tags, the media viewer and the lookup of
 * missing places (editors only: it writes place rows).
 */
export function useWorkspaceSession(journeyId: string): WorkspaceSession {
  const { i18n, t } = useTranslation()
  const state = useJourneyWorkspace(journeyId)
  const edits = useWorkspaceEdits(journeyId)
  const journeyCover = useJourneyCoverQuery(journeyId)
  const locale = i18n.language
  const tree = state.status === 'ready' ? state.tree : null
  const ordered = useMemo(
    () => (tree === null ? [] : collectMoments(tree)),
    [tree],
  )
  const allMoments = useMemo(() => ordered.map((m) => m.moment), [ordered])
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
  const hover = useMemo(() => createHoverStore(), [])
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
  const momentIds = useMemo(() => ordered.map((m) => m.moment.id), [ordered])
  const tags = useJourneyMomentTags(journeyId, momentIds)
  const { canEdit } = useCanEditJourney(journeyId)
  const placeProgress = useResolveMissingPlaces(
    journeyId,
    allMoments,
    tree !== null && canEdit,
  )
  const journeyCoverId = journeyCover.data ?? null
  const editing = useMemo<EditingContext | null>(
    () =>
      tree === null
        ? null
        : {
            edits,
            hover,
            moments: ordered,
            openViewer,
            pairs: new Map(
              adjacentSegmentPairs(tree).map((p) => [p.before.segment.id, p]),
            ),
            placeNames,
            tags,
            targets: buildCoverTargetIndex(tree, journeyId, journeyCoverId),
            unassigned: tree.unassigned,
          },
    [
      edits,
      hover,
      journeyCoverId,
      journeyId,
      openViewer,
      ordered,
      placeNames,
      tags,
      tree,
    ],
  )
  const viewerGroups = useMemo<ViewerGroup[]>(() => {
    if (tree === null) return []
    const out: ViewerGroup[] = []
    for (const entry of ordered) {
      if (entry.media.length === 0) continue
      out.push({
        id: entry.moment.id,
        items: entry.media,
        title: momentTitle(entry, t, locale),
        tz: entry.tz,
      })
    }
    if (tree.unassigned.length > 0)
      out.push({
        id: 'unassigned',
        items: tree.unassigned,
        title: t('workspace.unassigned'),
      })
    return out
  }, [ordered, tree, t, locale])
  return {
    canEdit,
    closeViewer,
    editing,
    edits,
    hover,
    locale,
    placeNames,
    placeProgress,
    state,
    tree,
    viewer,
    viewerGroups,
  }
}
