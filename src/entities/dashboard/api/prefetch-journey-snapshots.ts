import { getJourney } from '@/entities/journey/api/journey.repository'

export function prefetchJourneySnapshot(journeyId: string | undefined): void {
  if (journeyId === undefined) {
    return
  }

  void getJourney(journeyId).catch(() => {
    // Prefetch is best-effort for offline cold opens.
  })
}
