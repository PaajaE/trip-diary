import type { MediaItem } from '@/entities/media/model/media-library'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

export type CoverLevel = 'moment' | 'trip' | 'stage' | 'journey'

export interface CoverTarget {
  /** Explicitly stored cover of the target (null when none / automatic). */
  currentCoverId: string | null
  level: CoverLevel
  /** Row id of the moment / segment / journey that stores the cover. */
  targetId: string
}

const LEVEL_ORDER: CoverLevel[] = ['moment', 'trip', 'stage', 'journey']

/**
 * For every media item, the levels whose cover it may become: its moment, the
 * nearest enclosing trip and stage, and always the journey. Unassigned media
 * can only be the journey cover.
 */
export function buildCoverTargetIndex(
  tree: WorkspaceTree,
  journeyId: string,
  journeyCoverId: string | null,
): Map<string, CoverTarget[]> {
  const index = new Map<string, CoverTarget[]>()
  const journeyTarget: CoverTarget = {
    currentCoverId: journeyCoverId,
    level: 'journey',
    targetId: journeyId,
  }

  function add(media: MediaItem[], targets: CoverTarget[]) {
    for (const item of media) {
      index.set(
        item.id,
        [...targets, journeyTarget].sort(
          (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
        ),
      )
    }
  }
  function momentTarget(entry: WorkspaceMoment): CoverTarget {
    return {
      currentCoverId: entry.moment.coverMediaId,
      level: 'moment',
      targetId: entry.moment.id,
    }
  }
  function walk(node: WorkspaceSegment, inherited: CoverTarget[]) {
    const own: CoverTarget = {
      currentCoverId: node.segment.coverMediaId,
      level: node.segment.kind === 'stage' ? 'stage' : 'trip',
      targetId: node.segment.id,
    }
    // A deeper segment of the same kind replaces the inherited one.
    const chain = [...inherited.filter((t) => t.level !== own.level), own]
    for (const entry of node.moments)
      add(entry.media, [...chain, momentTarget(entry)])
    for (const child of node.children) walk(child, chain)
  }
  for (const root of tree.roots) walk(root, [])
  for (const entry of tree.looseMoments) add(entry.media, [momentTarget(entry)])
  add(tree.unassigned, [])
  return index
}
