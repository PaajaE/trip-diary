import type { JourneyListLoadResult } from '@/features/journeys/api/journeys.repository'

export interface JourneyListPresentation {
  showAuthoritativeEmpty: boolean
  showCachedBanner: boolean
  showInitialLoading: boolean
  showOfflineUnavailable: boolean
  showRemoteError: boolean
  showSpaceUnresolved: boolean
  statusMessageKey: string | null
}

export function resolveStatusMessageKey(
  result:
    | Pick<JourneyListLoadResult, 'isOffline' | 'isFromCache' | 'refreshFailed'>
    | undefined,
): string | null {
  if (result === undefined) {
    return null
  }

  if (result.refreshFailed) {
    return 'mobile.journeyListRefreshFailed'
  }

  if (result.isOffline && result.isFromCache) {
    return 'mobile.journeyListOfflineSaved'
  }

  return null
}

export function resolveJourneyListPresentation(input: {
  isError: boolean
  isFetched: boolean
  isLoading: boolean
  isOnline: boolean
  journeysCount: number
  result: JourneyListLoadResult | undefined
  spaceResolved: boolean
  supabaseConfigured: boolean
}): JourneyListPresentation {
  const { result, journeysCount } = input
  const showSpaceUnresolved =
    input.supabaseConfigured &&
    input.isOnline &&
    !input.spaceResolved &&
    !input.isLoading &&
    journeysCount === 0
  const showCachedBanner =
    result?.isFromCache === true && (result.isOffline || result.refreshFailed)
  const showOfflineUnavailable =
    result?.isOffline === true &&
    journeysCount === 0 &&
    input.isFetched &&
    !input.isLoading
  const showAuthoritativeEmpty =
    input.spaceResolved &&
    result?.isAuthoritativeEmpty === true &&
    journeysCount === 0 &&
    !input.isError
  const showInitialLoading =
    (input.isLoading || !input.spaceResolved) &&
    journeysCount === 0 &&
    !showOfflineUnavailable &&
    !showSpaceUnresolved
  const showRemoteError =
    input.isError &&
    journeysCount === 0 &&
    input.isOnline &&
    input.supabaseConfigured &&
    input.spaceResolved

  return {
    showAuthoritativeEmpty,
    showCachedBanner,
    showInitialLoading,
    showOfflineUnavailable,
    showRemoteError,
    showSpaceUnresolved,
    statusMessageKey: resolveStatusMessageKey(result),
  }
}

export function shouldInvalidateJourneyListOnReconnect(
  wasOnline: boolean,
  isOnline: boolean,
): boolean {
  return !wasOnline && isOnline
}
