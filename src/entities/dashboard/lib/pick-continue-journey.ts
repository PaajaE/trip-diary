import type { DashboardJourneyCard } from '@/entities/dashboard/model/dashboard'

export function pickContinueJourney(
  journeys: DashboardJourneyCard[],
): DashboardJourneyCard | null {
  if (journeys.length === 0) {
    return null
  }

  return (
    journeys.find((journey) => journey.status === 'active') ??
    journeys.find((journey) => journey.status === 'planning') ??
    journeys[0] ??
    null
  )
}
