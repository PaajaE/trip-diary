import type {
  JourneyEntry,
  JourneyFullDetail,
} from '@/features/journeys/model/journey-detail'
import type { LocalMomentRecord } from '@/platform/storage/local-moments'
import { localMomentToJourneyEntry } from '@/platform/storage/local-moments'

/**
 * Merges unsynced (and recently local) moments into a journey detail snapshot.
 * Local pending/failed content wins over remote rows with the same id.
 * Synced local rows are kept only when remote does not yet include them.
 */
export function mergeLocalMomentsIntoJourneyDetail(
  detail: JourneyFullDetail,
  localMoments: LocalMomentRecord[],
  coverByEntryId: Map<string, string | null> = new Map(),
): JourneyFullDetail {
  if (localMoments.length === 0) {
    return detail
  }

  const byId = new Map<string, JourneyEntry>()
  for (const entry of detail.entries) {
    byId.set(entry.id, entry)
  }

  for (const local of localMoments) {
    const remote = byId.get(local.id)
    const preferLocal =
      local.syncStatus === 'pending' ||
      local.syncStatus === 'syncing' ||
      local.syncStatus === 'failed' ||
      remote === undefined

    if (!preferLocal) {
      continue
    }

    const cover =
      coverByEntryId.get(local.id) ?? remote?.coverPreviewUrl ?? null
    byId.set(local.id, localMomentToJourneyEntry(local, cover))
  }

  const entries = [...byId.values()].sort((left, right) => {
    const byEvent = compareDesc(left.eventAt, right.eventAt)
    if (byEvent !== 0) {
      return byEvent
    }
    const byCreated = compareDesc(left.createdAt, right.createdAt)
    if (byCreated !== 0) {
      return byCreated
    }
    return right.id.localeCompare(left.id)
  })

  return {
    ...detail,
    entries,
  }
}

function compareDesc(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftMs =
    left === null || left === undefined || left.length === 0
      ? null
      : new Date(left).getTime()
  const rightMs =
    right === null || right === undefined || right.length === 0
      ? null
      : new Date(right).getTime()

  if (leftMs === null && rightMs === null) {
    return 0
  }
  if (leftMs === null || Number.isNaN(leftMs)) {
    return 1
  }
  if (rightMs === null || Number.isNaN(rightMs)) {
    return -1
  }
  return rightMs - leftMs
}
