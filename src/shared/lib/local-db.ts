import Dexie, { type EntityTable } from 'dexie'
import type { Entry } from '@/entities/entry/model/entry'
import type { SyncOperation } from '@/shared/sync/sync-operation'

class TripDiaryDatabase extends Dexie {
  entries!: EntityTable<Entry, 'id'>
  syncOperations!: EntityTable<SyncOperation, 'id'>

  constructor() {
    super('trip-diary')
    this.version(1).stores({
      entries: 'id, creatorId, syncStatus, updatedAt',
      syncOperations: 'id, status, createdAt',
    })
    this.version(2).stores({
      entries: 'id, creatorId, syncStatus, updatedAt',
      syncOperations: 'id, creatorId, status, createdAt',
    })
  }
}

export const localDb = new TripDiaryDatabase()
