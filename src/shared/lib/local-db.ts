import Dexie, { type EntityTable } from 'dexie'
import type { Entry } from '@/entities/entry/model/entry'
import type {
  LocalPhoto,
  LocalPhotoVariant,
} from '@/entities/photo/model/photo'
import type { SyncOperation } from '@/shared/sync/sync-operation'

class TripDiaryDatabase extends Dexie {
  entries!: EntityTable<Entry, 'id'>
  photos!: EntityTable<LocalPhoto, 'id'>
  photoVariants!: EntityTable<LocalPhotoVariant, 'id'>
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
    this.version(3).stores({
      entries: 'id, creatorId, syncStatus, updatedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt',
    })
    this.version(4).stores({
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt',
    })
  }
}

export const localDb = new TripDiaryDatabase()
