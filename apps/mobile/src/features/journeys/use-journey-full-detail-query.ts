import { useQuery } from '@tanstack/react-query'
import { fetchJourneyFullDetail } from '@/features/journeys/api/journey-detail.repository'
import { mergeLocalMomentsIntoJourneyDetail } from '@/features/journeys/lib/merge-local-moments'
import { journeyQueryKeys } from '@/features/journeys/query-keys'
import { isNetworkOnline, useNetworkState } from '@/foundation/network'
import { listActiveMomentDraftPhotos } from '@/platform/media/draft-photos'
import {
  cacheJourneyContent,
  getCachedJourneyContent,
} from '@/platform/storage/journey-content-cache'
import { listLocalMomentsForJourney } from '@/platform/storage/local-moments'
import { JourneyRepositoryError } from '@/features/journeys/api/journeys.repository'
import type { JourneyFullDetail } from '@/features/journeys/model/journey-detail'

function requireJourneyId(journeyId: string | undefined): string {
  if (journeyId === undefined || journeyId.length === 0) {
    throw new Error('Journey ID is required')
  }

  return journeyId
}

async function loadLocalCoverPreviewUrls(
  journeyId: string,
  entryIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  for (const entryId of entryIds) {
    const drafts = await listActiveMomentDraftPhotos(`entry:${entryId}`)
    const ready = drafts.find(
      (row) =>
        row.status === 'ready' &&
        (row.smallUri !== null ||
          row.thumbUri !== null ||
          row.localUri.trim().length > 0),
    )
    if (ready === undefined) {
      continue
    }
    map.set(entryId, ready.smallUri ?? ready.thumbUri ?? ready.localUri)
  }
  // Also check create-key leftovers for this journey (pre-save drafts).
  const createDrafts = await listActiveMomentDraftPhotos(
    `journey:${journeyId}:new`,
  )
  if (createDrafts.length > 0 && entryIds.length === 0) {
    // No-op — unsaved create drafts are not Moments yet.
  }
  return map
}

async function hydrateJourneyDetail(
  journeyId: string,
  isOnline: boolean,
): Promise<{ detail: JourneyFullDetail; isOffline: boolean }> {
  const localMoments = await listLocalMomentsForJourney(journeyId)

  if (isOnline) {
    try {
      const remote = await fetchJourneyFullDetail(journeyId)
      await cacheJourneyContent(remote)
      const coverByEntryId = await loadLocalCoverPreviewUrls(
        journeyId,
        localMoments.map((moment) => moment.id),
      )
      return {
        detail: mergeLocalMomentsIntoJourneyDetail(
          remote,
          localMoments,
          coverByEntryId,
        ),
        isOffline: false,
      }
    } catch (error) {
      const cached = await getCachedJourneyContent(journeyId)
      if (cached !== null) {
        const coverByEntryId = await loadLocalCoverPreviewUrls(
          journeyId,
          localMoments.map((moment) => moment.id),
        )
        return {
          detail: mergeLocalMomentsIntoJourneyDetail(
            cached,
            localMoments,
            coverByEntryId,
          ),
          isOffline: true,
        }
      }
      throw error
    }
  }

  const cached = await getCachedJourneyContent(journeyId)
  if (cached === null && localMoments.length === 0) {
    throw new JourneyRepositoryError(
      'Journey content is unavailable offline until you open it online once.',
      'FETCH_FAILED',
    )
  }

  const base: JourneyFullDetail =
    cached ??
    ({
      endsAt: null,
      entries: [],
      id: journeyId,
      spaceId: localMoments[0]?.spaceId ?? '',
      stages: [],
      startsAt: null,
      status: 'active',
      stops: [],
      summary: '',
      title: '',
    } satisfies JourneyFullDetail)

  const coverByEntryId = await loadLocalCoverPreviewUrls(
    journeyId,
    localMoments.map((moment) => moment.id),
  )

  return {
    detail: mergeLocalMomentsIntoJourneyDetail(
      base,
      localMoments,
      coverByEntryId,
    ),
    isOffline: true,
  }
}

export function useJourneyFullDetailQuery(journeyId: string | undefined) {
  const networkState = useNetworkState()
  const isOnline = isNetworkOnline(networkState)

  return useQuery({
    enabled: journeyId !== undefined && journeyId.length > 0,
    queryFn: async () =>
      hydrateJourneyDetail(requireJourneyId(journeyId), isOnline),
    queryKey: [...journeyQueryKeys.content(journeyId ?? ''), isOnline],
  })
}
