import { ensureFlowOwner } from '@/features/journey-flow/api/flow-owner'
import {
  parseOrganizeSnapshot,
  type OrganizeSnapshot,
} from '@/features/journey-organize/model/organize-snapshot'
import { localDb } from '@/shared/lib/local-db'

/**
 * Where the last run's undo snapshot of each journey lives (client only),
 * scoped to the signed-in user.
 */
export interface OrganizeSnapshotStore {
  get: (userId: string, journeyId: string) => Promise<OrganizeSnapshot | null>
  put: (userId: string, snapshot: OrganizeSnapshot) => Promise<void>
  /**
   * Drops the snapshot only while it still is the one of `runId` (a newer
   * run's snapshot written meanwhile is kept). Resolves true when dropped.
   */
  removeRun: (
    userId: string,
    journeyId: string,
    runId: string,
  ) => Promise<boolean>
}

/**
 * Dexie-backed store: one row per journey (the newest run replaces the older
 * one). A row that fails validation, belongs to another journey or another
 * user is not returned (and an invalid one is dropped).
 */
export const dexieSnapshotStore: OrganizeSnapshotStore = {
  async get(userId, journeyId) {
    ensureFlowOwner(userId)
    const row = await localDb.organizeSnapshots.get(journeyId)
    if (row?.userId !== userId) return null
    const snapshot = parseOrganizeSnapshot(row.data)
    if (snapshot?.journeyId !== journeyId) {
      await localDb.organizeSnapshots.delete(journeyId)
      return null
    }
    return snapshot
  },
  async put(userId, snapshot) {
    ensureFlowOwner(userId)
    await localDb.organizeSnapshots.put({
      data: snapshot,
      journeyId: snapshot.journeyId,
      userId,
    })
  },
  removeRun(userId, journeyId, runId) {
    return localDb.transaction('rw', localDb.organizeSnapshots, async () => {
      const row = await localDb.organizeSnapshots.get(journeyId)
      if (row?.userId !== userId) return false
      const snapshot = parseOrganizeSnapshot(row.data)
      if (snapshot !== null && snapshot.runId !== runId) return false
      await localDb.organizeSnapshots.delete(journeyId)
      return true
    })
  },
}

/** In-memory store for tests and previews. */
export function memorySnapshotStore(): OrganizeSnapshotStore & {
  rows: Map<string, { data: unknown; userId: string }>
} {
  const rows = new Map<string, { data: unknown; userId: string }>()
  return {
    get(userId, journeyId) {
      const row = rows.get(journeyId)
      if (row?.userId !== userId) {
        return Promise.resolve(null)
      }
      const snapshot = parseOrganizeSnapshot(row.data)
      if (snapshot === null) rows.delete(journeyId)
      return Promise.resolve(snapshot)
    },
    put(userId, snapshot) {
      rows.set(snapshot.journeyId, { data: snapshot, userId })
      return Promise.resolve()
    },
    removeRun(userId, journeyId, runId) {
      const row = rows.get(journeyId)
      if (row?.userId !== userId) {
        return Promise.resolve(false)
      }
      const snapshot = parseOrganizeSnapshot(row.data)
      if (snapshot !== null && snapshot.runId !== runId) {
        return Promise.resolve(false)
      }
      rows.delete(journeyId)
      return Promise.resolve(true)
    },
    rows,
  }
}
