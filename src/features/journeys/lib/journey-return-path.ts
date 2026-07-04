import type { JourneyAuthorSection } from '@/features/journeys/lib/journey-author-section'

export function buildJourneyReturnPath(
  journeyId: string,
  section: JourneyAuthorSection | 'overview' = 'overview',
): string {
  if (section === 'overview' || section === 'story') {
    return `/j/${journeyId}`
  }
  return `/j/${journeyId}?section=${section}`
}
