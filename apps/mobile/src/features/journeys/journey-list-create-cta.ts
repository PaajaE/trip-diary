import type { JourneyListPresentation } from '@/features/journeys/journey-list-presentation'

export type JourneyListCreateCta =
  | 'empty'
  | 'header'
  | 'offline-hint'
  | 'none'

/**
 * Exactly one primary create action placement for the journey list screen.
 * Never returns both empty and header.
 */
export function resolveJourneyListCreateCta(input: {
  canAttemptCreate: boolean
  isOnline: boolean
  journeysCount: number
  presentation: Pick<
    JourneyListPresentation,
    | 'showAuthoritativeEmpty'
    | 'showInitialLoading'
    | 'showOfflineUnavailable'
    | 'showRemoteError'
    | 'showSpaceUnresolved'
  >
}): JourneyListCreateCta {
  const { presentation } = input

  if (
    presentation.showInitialLoading ||
    presentation.showRemoteError ||
    presentation.showSpaceUnresolved ||
    presentation.showOfflineUnavailable
  ) {
    return 'none'
  }

  if (presentation.showAuthoritativeEmpty && input.journeysCount === 0) {
    if (!input.canAttemptCreate) {
      return input.isOnline ? 'none' : 'offline-hint'
    }
    return 'empty'
  }

  if (input.journeysCount > 0) {
    if (!input.canAttemptCreate) {
      return input.isOnline ? 'none' : 'offline-hint'
    }
    return 'header'
  }

  return 'none'
}
