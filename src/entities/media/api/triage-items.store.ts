import {
  triageItemSchema,
  type TriageItem,
  type TriageStatus,
} from '@/entities/media/model/triage-item'
import { localDb } from '@/shared/lib/local-db'

/** Persistence of local triage decisions (Dexie; memory twin for tests). */
export interface TriageItemStore {
  /** Removes the given ids. */
  deleteItems(ids: readonly string[]): Promise<void>
  /** All items of a journey for one owner (invalid rows are dropped). */
  listItems(journeyId: string, ownerId: string): Promise<TriageItem[]>
  putItems(items: readonly TriageItem[]): Promise<void>
}

function parseRows(rows: readonly unknown[]): TriageItem[] {
  const items: TriageItem[] = []
  for (const row of rows) {
    const parsed = triageItemSchema.safeParse(row)
    if (parsed.success) items.push(parsed.data)
  }
  return items
}

export const dexieTriageItemStore: TriageItemStore = {
  async deleteItems(ids) {
    await localDb.triageItems.bulkDelete([...ids])
  },
  async listItems(journeyId, ownerId) {
    const rows = await localDb.triageItems
      .where('journeyId')
      .equals(journeyId)
      .toArray()
    return parseRows(rows).filter((item) => item.ownerId === ownerId)
  },
  async putItems(items) {
    await localDb.triageItems.bulkPut([...items])
  },
}

export function createMemoryTriageItemStore(
  initial: readonly TriageItem[] = [],
): TriageItemStore {
  const rows = new Map(initial.map((item) => [item.id, item]))
  return {
    deleteItems(ids) {
      for (const id of ids) rows.delete(id)
      return Promise.resolve()
    },
    listItems(journeyId, ownerId) {
      return Promise.resolve(
        [...rows.values()].filter(
          (item) => item.journeyId === journeyId && item.ownerId === ownerId,
        ),
      )
    },
    putItems(items) {
      for (const item of items) rows.set(item.id, item)
      return Promise.resolve()
    },
  }
}

/** Same item with another status (pure helper for the callers). */
export function withTriageStatus(
  item: TriageItem,
  status: TriageStatus,
  updatedAt: string,
): TriageItem {
  return { ...item, status, updatedAt }
}
