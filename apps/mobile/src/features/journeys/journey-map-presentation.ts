import type { JourneyStopsLoadResult } from '@/features/journeys/api/journey-stops.repository'
import type { MappableJourneyStop } from '@/features/journeys/lib/journey-map-stops'
import type { JourneyMapCamera } from '@trip-diary/utils'

export interface JourneyMapPresentation {
  showAuthoritativeEmpty: boolean
  showCachedBanner: boolean
  showInitialLoading: boolean
  showMapUnavailable: boolean
  showNoMappableStops: boolean
  showRemoteError: boolean
  statusMessageKey: string | null
}

export function resolveJourneyMapStatusMessageKey(
  result:
    | Pick<
        JourneyStopsLoadResult,
        'isOffline' | 'isFromCache' | 'refreshFailed'
      >
    | undefined,
): string | null {
  if (result === undefined) {
    return null
  }

  if (result.refreshFailed) {
    return 'mobile.journeyMapRefreshFailed'
  }

  if (result.isOffline && result.isFromCache) {
    return 'mobile.journeyMapOfflineSaved'
  }

  if (result.isOffline && !result.isFromCache) {
    return 'mobile.journeyMapOfflineUnavailable'
  }

  return null
}

export function resolveJourneyMapPresentation(input: {
  camera: JourneyMapCamera | null
  isError: boolean
  isFetched: boolean
  isLoading: boolean
  isOnline: boolean
  mappableStops: MappableJourneyStop[]
  result: JourneyStopsLoadResult | undefined
  supabaseConfigured: boolean
}): JourneyMapPresentation {
  const { mappableStops, result } = input
  const showCachedBanner =
    result?.isFromCache === true && (result.isOffline || result.refreshFailed)
  const showMapUnavailable =
    result?.isOffline === true &&
    mappableStops.length === 0 &&
    input.isFetched &&
    !input.isLoading
  const showAuthoritativeEmpty =
    result?.isAuthoritativeEmpty === true && mappableStops.length === 0
  const showNoMappableStops =
    result !== undefined &&
    !result.isAuthoritativeEmpty &&
    mappableStops.length === 0 &&
    input.isFetched &&
    !input.isLoading &&
    !showMapUnavailable
  const showInitialLoading =
    input.isLoading && result === undefined && !showMapUnavailable
  const showRemoteError =
    input.isError &&
    mappableStops.length === 0 &&
    input.isOnline &&
    input.supabaseConfigured &&
    !showMapUnavailable

  return {
    showAuthoritativeEmpty,
    showCachedBanner,
    showInitialLoading,
    showMapUnavailable,
    showNoMappableStops,
    showRemoteError,
    statusMessageKey: resolveJourneyMapStatusMessageKey(result),
  }
}
