import { useQuery } from '@tanstack/react-query'
import {
  getCoverMedia,
  getJourneyProgress,
  type JourneyProgress,
} from '@/entities/dashboard/api/journey-progress.repository'
import { dashboardQueryKeys } from '@/entities/dashboard/api/dashboard-query-keys'
import type { MediaItem } from '@/entities/media/model/media-library'

export interface DashboardProgress {
  /** Cover media (with variants) by journey id; missing when unavailable. */
  covers: ReadonlyMap<string, MediaItem>
  /** Progress by journey id. */
  progress: ReadonlyMap<string, JourneyProgress>
}

/**
 * Progress and cover photos for the visible (already synced) journeys. Both
 * requests are best effort: when the RPC is absent or fails, `data` stays
 * undefined and the dashboard renders the way it did before; a failed cover
 * lookup only drops the photos.
 */
export function useJourneyProgressQuery(
  userId: string | undefined,
  journeyIds: string[],
) {
  const ids = [...journeyIds].sort()
  const progressQuery = useQuery({
    enabled: userId !== undefined && userId !== '' && ids.length > 0,
    queryFn: () => getJourneyProgress(ids),
    queryKey: dashboardQueryKeys.progress(userId, ids),
    retry: false,
  })
  const coverIds = [
    ...new Set(
      (progressQuery.data ?? []).flatMap((row) =>
        row.coverMediaId === null ? [] : [row.coverMediaId],
      ),
    ),
  ].sort()
  const coversQuery = useQuery({
    enabled: coverIds.length > 0,
    queryFn: () => getCoverMedia(coverIds),
    queryKey: dashboardQueryKeys.covers(userId, coverIds),
    retry: false,
  })

  const rows = progressQuery.data
  if (rows === undefined) return undefined
  const covers = new Map<string, MediaItem>()
  const progress = new Map<string, JourneyProgress>()
  for (const row of rows) {
    progress.set(row.journeyId, row)
    const cover =
      row.coverMediaId === null
        ? undefined
        : coversQuery.data?.get(row.coverMediaId)
    if (cover !== undefined) covers.set(row.journeyId, cover)
  }
  return { covers, progress } satisfies DashboardProgress
}
