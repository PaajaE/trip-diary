import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'

export function splitPlannedStops(
  stops: JourneyDetail['stops'],
  checklistItems: JourneyChecklistItem[],
): {
  genericStops: JourneyDetail['stops']
  natureStops: JourneyDetail['stops']
} {
  const natureStopIds = new Set(
    checklistItems
      .map((item) => item.stopId)
      .filter((stopId): stopId is string => stopId !== null),
  )

  const natureStops: JourneyDetail['stops'] = []
  const genericStops: JourneyDetail['stops'] = []

  for (const stop of stops) {
    if (natureStopIds.has(stop.id)) {
      natureStops.push(stop)
    } else {
      genericStops.push(stop)
    }
  }

  return { genericStops, natureStops }
}

export function checklistItemForStop(
  checklistItems: JourneyChecklistItem[],
  stopId: string,
): JourneyChecklistItem | undefined {
  return checklistItems.find((item) => item.stopId === stopId)
}
