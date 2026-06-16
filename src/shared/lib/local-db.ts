import Dexie, { type EntityTable } from 'dexie'
import type { Entry } from '@/entities/entry/model/entry'
import type { LocalJourney } from '@/entities/journey/model/local-journey'
import type { LocalJourneyLink } from '@/entities/journey/model/local-journey-link'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { SpaceSummary } from '@/entities/space/model/space'
import type {
  LocalPhoto,
  LocalPhotoVariant,
} from '@/entities/photo/model/photo'
import type { SyncOperation } from '@/shared/sync/sync-operation'

interface JourneySnapshotRecord {
  cachedAt: string
  canContribute: boolean
  journey: JourneyDetail
  journeyId: string
}

interface CachedUserSpacesRecord {
  cachedAt: string
  spaces: SpaceSummary[]
  userId: string
}

class TripDiaryDatabase extends Dexie {
  cachedUserSpaces!: EntityTable<CachedUserSpacesRecord, 'userId'>
  entries!: EntityTable<Entry, 'id'>
  journeyLinks!: EntityTable<LocalJourneyLink, 'entryId'>
  journeySnapshots!: EntityTable<JourneySnapshotRecord, 'journeyId'>
  localJourneys!: EntityTable<LocalJourney, 'id'>
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
    this.version(5).stores({
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt',
    })
    this.version(6).stores({
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(7).stores({
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(8)
      .stores({
        entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
        journeyLinks:
          'entryId, journeyId, creatorId, stageId, stopId, createdAt',
        photos: 'id, entryId, creatorId, syncStatus, createdAt',
        photoVariants: 'id, photoId, kind, createdAt',
        syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
      })
      .upgrade(async (transaction) => {
        await transaction.table('journeyLinks').toCollection().modify({
          latitude: null,
          locationTitle: null,
          longitude: null,
        })
        await transaction
          .table<SyncOperation, string>('syncOperations')
          .toCollection()
          .modify((operation) => {
            if (operation.type !== 'journey.assignment.upsert') {
              return
            }
            operation.latitude = null
            operation.locationTitle = null
            operation.longitude = null
          })
      })
    this.version(9).stores({
      cachedUserSpaces: 'userId, cachedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(10).stores({
      cachedUserSpaces: 'userId, cachedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
  }
}

export const localDb = new TripDiaryDatabase()
