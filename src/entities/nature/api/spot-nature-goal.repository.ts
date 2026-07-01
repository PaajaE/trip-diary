import { setJourneyChecklistItemChecked } from '@/entities/checklist/api/checklist-mutation.repository'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import { createNatureObservation } from '@/entities/nature/api/observation-mutation.repository'
import type { NatureObservation } from '@/entities/nature/model/observation'

export async function spotNatureGoal(input: {
  creatorId: string
  entryId?: string
  item: JourneyChecklistItem
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  photoId?: string | null
}): Promise<NatureObservation> {
  const observation = await createNatureObservation({
    category: input.item.category,
    checklistItemId: input.item.id,
    commonName: input.item.title,
    confidence: 'seen',
    creatorId: input.creatorId,
    entryId: input.entryId ?? null,
    journeyId: input.journeyId,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    photoId: input.photoId ?? null,
  })

  if (input.item.checkedAt === null) {
    await setJourneyChecklistItemChecked({
      checked: true,
      creatorId: input.creatorId,
      item: input.item,
      journeyId: input.journeyId,
    })
  }

  return observation
}
