/**
 * Hierarchy depth of the workspace (plan 4f, ZS-6 "Hloubka podle velikosti
 * cesty"): which levels the overview shows. An empty level is not shown:
 * without a stage level (short journeys, or no clear stages) suggested stages
 * are dissolved, their stops and trips stand on their own.
 */
import {
  hierarchyDepth,
  type DepthStage,
  type HierarchyDepth,
} from '@trip-diary/core/automation'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'
import { UNKNOWN_DAY } from '@/features/journey-workspace/model/workspace-days'

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function time(iso: string): number {
  const value = Date.parse(iso)
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

/** Stage segments of the tree (any depth), as hierarchy-depth input. */
export function depthStages(tree: WorkspaceTree): DepthStage[] {
  const out: DepthStage[] = []
  const walk = (node: WorkspaceSegment) => {
    const { segment } = node
    out.push({
      endsAt: segment.endsAt,
      kind: segment.kind,
      origin: segment.origin,
      startsAt: segment.startsAt,
    })
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
}

/** Depth of the journey from its photo days and stages. */
export function workspaceDepth(
  tree: WorkspaceTree,
  dayKeys: readonly string[],
): HierarchyDepth {
  return hierarchyDepth({
    dayKeys: dayKeys.filter((key) => key !== UNKNOWN_DAY),
    stages: depthStages(tree),
  })
}

/**
 * The tree without the stage level: suggested stage roots are dissolved
 * (their own stops become loose, their trips become roots). Stages the user
 * made or accepted are kept (the depth never hides them anyway).
 */
export function withoutStageLevel(tree: WorkspaceTree): WorkspaceTree {
  const roots: WorkspaceSegment[] = []
  const loose: WorkspaceMoment[] = [...tree.looseMoments]
  let changed = false
  for (const root of tree.roots) {
    if (root.segment.kind === 'stage' && root.segment.origin === 'suggested') {
      changed = true
      loose.push(...root.moments)
      roots.push(...root.children)
    } else {
      roots.push(root)
    }
  }
  if (!changed) return tree
  roots.sort(
    (a, b) =>
      time(a.segment.startsAt) - time(b.segment.startsAt) ||
      a.segment.position - b.segment.position ||
      cmp(a.segment.id, b.segment.id),
  )
  loose.sort(
    (a, b) =>
      time(a.moment.startsAt) - time(b.moment.startsAt) ||
      cmp(a.moment.id, b.moment.id),
  )
  return { looseMoments: loose, roots, unassigned: tree.unassigned }
}

/** What the overview chrome shows for a depth. */
export interface DepthChrome {
  /** Day strip in the rail (the day level exists). */
  showDays: boolean
  /** Rail column / chips at all (some level to navigate). */
  showNav: boolean
  /** Stage list in the rail and the stage chips. */
  showStages: boolean
}

export function depthChrome(depth: HierarchyDepth): DepthChrome {
  const showStages = depth.stageMode !== 'none'
  const showDays = depth.levels.includes('days')
  return { showDays, showNav: showStages || showDays, showStages }
}
