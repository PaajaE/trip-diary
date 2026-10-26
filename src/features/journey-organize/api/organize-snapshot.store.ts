import {
  parseOrganizeSnapshot,
  type OrganizeSnapshot,
} from '@/features/journey-organize/model/organize-snapshot'
import { localDb } from '@/shared/lib/local-db'

/** Where the last run's undo snapshot of each journey lives (client only). */
export interface OrganizeSnapshotStore {
  get: (journeyId: string) => Promise<OrganizeSnapshot | null>
  put: (snapshot: OrganizeSnapshot) => Promise<void>
  remove: (journeyId: string) => Promise<void>
}

/**
 * Dexie-backed store: one row per journey (the newest run replaces the older
 * one). A row that fails validation, or belongs to another journey, is
 * dropped on read.
 */
export const dexieSnapshotStore: OrganizeSnapshotStore = {
  async get(journeyId) {
    const row = await localDb.organizeSnapshots.get(journeyId)
    if (row === undefined) return null
    const snapshot = parseOrganizeSnapshot(row.data)
    if (snapshot?.journeyId !== journeyId) {
      await localDb.organizeSnapshots.delete(journeyId)
      return null
    }
    return snapshot
  },
  async put(snapshot) {
    await localDb.organizeSnapshots.put({
      data: snapshot,
      journeyId: snapshot.journeyId,
    })
  },
  async remove(journeyId) {
    await localDb.organizeSnapshots.delete(journeyId)
  },
}

/** In-memory store for tests and previews. */
export function memorySnapshotStore(): OrganizeSnapshotStore & {
  rows: Map<string, unknown>
} {
  const rows = new Map<string, unknown>()
  return {
    get(journeyId) {
      const snapshot = parseOrganizeSnapshot(rows.get(journeyId))
      if (snapshot === null) rows.delete(journeyId)
      return Promise.resolve(snapshot)
    },
    put(snapshot) {
      rows.set(snapshot.journeyId, snapshot)
      return Promise.resolve()
    },
    remove(journeyId) {
      rows.delete(journeyId)
      return Promise.resolve()
    },
    rows,
  }
}
