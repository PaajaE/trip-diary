import type { JourneySection } from '@/features/journeys/ui/JourneySectionTabs'

export function buildJourneyReturnPath(
  journeyId: string,
  section: JourneySection = 'overview',
): string {
  if (section === 'overview') {
    return `/j/${journeyId}`
  }
  return `/j/${journeyId}?section=${section}`
}
