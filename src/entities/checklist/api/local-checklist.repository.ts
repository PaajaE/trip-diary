import {
  journeyChecklistItemSchema,
  localChecklistItemSchema,
  type JourneyChecklistItem,
  type LocalChecklistItem,
} from '@/entities/checklist/model/checklist'
import { localDb } from '@/shared/lib/local-db'

function toJourneyChecklistItem(
  item: LocalChecklistItem,
): JourneyChecklistItem {
  return journeyChecklistItemSchema.parse({
    category: item.category,
    checkedAt: item.checkedAt,
    entryId: item.entryId,
    id: item.id,
    itemSlug: item.itemSlug,
    notes: item.notes,
    position: item.position,
    stopId: item.stopId,
    templateSlug: item.templateSlug,
    title: item.title,
  })
}

export async function listLocalChecklistItems(
  journeyId: string,
): Promise<JourneyChecklistItem[]> {
  const items = await localDb.localChecklistItems
    .where('journeyId')
    .equals(journeyId)
    .sortBy('position')
  return items.map(toJourneyChecklistItem)
}

export async function getLocalChecklistItem(
  id: string,
): Promise<LocalChecklistItem | undefined> {
  return localDb.localChecklistItems.get(id)
}

export async function saveLocalChecklistItem(
  item: LocalChecklistItem,
): Promise<void> {
  await localDb.localChecklistItems.put(localChecklistItemSchema.parse(item))
}

export async function listPendingLocalChecklistItems(
  journeyId: string,
): Promise<LocalChecklistItem[]> {
  const items = await localDb.localChecklistItems
    .where('journeyId')
    .equals(journeyId)
    .toArray()
  return items.filter((item) => item.syncStatus === 'pending')
}

export async function removeSyncedLocalChecklistItem(
  id: string,
): Promise<void> {
  await localDb.localChecklistItems.delete(id)
}
