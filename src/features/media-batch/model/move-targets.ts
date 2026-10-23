import type { TFunction } from 'i18next'
import { formatInstantDate } from '@/features/journey-workspace/lib/format-range'
import { momentTitle } from '@/features/journey-workspace/lib/moment-labels'
import {
  collectMoments,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

export interface BatchMoveTarget {
  id: string
  label: string
}

/**
 * Every stop (moment) of the journey in document order as a "Move to" target,
 * labelled with its day so equal titles stay tellable apart.
 */
export function batchMoveTargets(
  tree: WorkspaceTree,
  t: TFunction,
  locale: string,
): BatchMoveTarget[] {
  return collectMoments(tree).map((entry) => ({
    id: entry.moment.id,
    label: `${formatInstantDate(entry.moment.startsAt, entry.tz, locale)} · ${momentTitle(entry, t, locale)}`,
  }))
}
