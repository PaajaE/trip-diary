import { getJourney } from '@/entities/journey/api/journey.repository'

export function prefetchJourneySnapshots(journeyIds: string[]): void {
  const uniqueIds = [...new Set(journeyIds)]
  for (const journeyId of uniqueIds) {
    void getJourney(journeyId).catch(() => {
      // Prefetch is best-effort for offline cold opens.
    })
  }
}
