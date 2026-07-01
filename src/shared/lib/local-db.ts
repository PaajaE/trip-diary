import Dexie, { type EntityTable } from 'dexie'
import type { Entry } from '@/entities/entry/model/entry'
import type { LocalJourney } from '@/entities/journey/model/local-journey'
import type { LocalJourneyLink } from '@/entities/journey/model/local-journey-link'
import type {
  LocalJourneyGuide,
  LocalJourneyStage,
  LocalJourneyStop,
} from '@/entities/journey/model/local-journey-structure'
import type { DashboardData } from '@/entities/dashboard/model/dashboard'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { CurrentProfile } from '@/entities/profile/model/profile'
import type { SpaceSummary } from '@/entities/space/model/space'
import type {
  LocalPhoto,
  LocalPhotoVariant,
} from '@/entities/photo/model/photo'
import type { LocalChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type {
  LocalNatureObservation,
  NatureObservation,
  RegionalSpecies,
} from '@/entities/nature/model/observation'
import type { LocalPhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type { SyncOperation } from '@/shared/sync/sync-operation'

export interface JourneySnapshotRecord {
  cachedAt: string
  canContribute: boolean
  checklistItems: JourneyChecklistItem[]
  journey: JourneyDetail
  journeyId: string
  observations: NatureObservation[]
}

interface NatureGuideCacheRecord {
  cacheKey: string
  fetchedAt: string
  id: string
  journeyId: string
  species: RegionalSpecies[]
}

interface CachedUserSpacesRecord {
  cachedAt: string
  spaces: SpaceSummary[]
  userId: string
}

interface DashboardSnapshotRecord {
  cachedAt: string
  data: DashboardData
  userId: string
}

interface CachedProfileRecord {
  cachedAt: string
  profile: CurrentProfile
  userId: string
}

interface DeletedRecord {
  creatorId: string
  deletedAt: string
  id: string
  kind: 'entry' | 'guide' | 'journey' | 'photo' | 'stage' | 'stop'
}

class TripDiaryDatabase extends Dexie {
  cachedUserSpaces!: EntityTable<CachedUserSpacesRecord, 'userId'>
  cachedProfiles!: EntityTable<CachedProfileRecord, 'userId'>
  dashboardSnapshots!: EntityTable<DashboardSnapshotRecord, 'userId'>
  deletedRecords!: EntityTable<DeletedRecord, 'id'>
  entries!: EntityTable<Entry, 'id'>
  journeyLinks!: EntityTable<LocalJourneyLink, 'entryId'>
  journeySnapshots!: EntityTable<JourneySnapshotRecord, 'journeyId'>
  localChecklistItems!: EntityTable<LocalChecklistItem, 'id'>
  localJourneyGuides!: EntityTable<LocalJourneyGuide, 'id'>
  localJourneyStages!: EntityTable<LocalJourneyStage, 'id'>
  localJourneyStops!: EntityTable<LocalJourneyStop, 'id'>
  localJourneys!: EntityTable<LocalJourney, 'id'>
  localNatureObservations!: EntityTable<LocalNatureObservation, 'id'>
  natureGuideCache!: EntityTable<NatureGuideCacheRecord, 'id'>
  localPhotoTagAssignments!: EntityTable<LocalPhotoTagAssignment, 'key'>
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
    this.version(11).stores({
      cachedUserSpaces: 'userId, cachedAt',
      cachedProfiles: 'userId, cachedAt',
      dashboardSnapshots: 'userId, cachedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(12).stores({
      cachedUserSpaces: 'userId, cachedAt',
      cachedProfiles: 'userId, cachedAt',
      dashboardSnapshots: 'userId, cachedAt',
      deletedRecords: 'id, kind, creatorId, deletedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(13).stores({
      cachedUserSpaces: 'userId, cachedAt',
      cachedProfiles: 'userId, cachedAt',
      dashboardSnapshots: 'userId, cachedAt',
      deletedRecords: 'id, kind, creatorId, deletedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localJourneyGuides: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStages: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStops: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(14).stores({
      cachedUserSpaces: 'userId, cachedAt',
      cachedProfiles: 'userId, cachedAt',
      dashboardSnapshots: 'userId, cachedAt',
      deletedRecords: 'id, kind, creatorId, deletedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localJourneyGuides: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStages: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStops: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      localPhotoTagAssignments:
        'key, photoId, journeyId, creatorId, tagId, syncStatus',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(15).stores({
      cachedUserSpaces: 'userId, cachedAt',
      cachedProfiles: 'userId, cachedAt',
      dashboardSnapshots: 'userId, cachedAt',
      deletedRecords: 'id, kind, creatorId, deletedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localChecklistItems: 'id, journeyId, creatorId, syncStatus, position',
      localJourneyGuides: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStages: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStops: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      localNatureObservations:
        'id, journeyId, creatorId, syncStatus, createdAt',
      localPhotoTagAssignments:
        'key, photoId, journeyId, creatorId, tagId, syncStatus',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
    this.version(16).stores({
      cachedUserSpaces: 'userId, cachedAt',
      cachedProfiles: 'userId, cachedAt',
      dashboardSnapshots: 'userId, cachedAt',
      deletedRecords: 'id, kind, creatorId, deletedAt',
      entries: 'id, creatorId, spaceId, syncStatus, updatedAt',
      journeyLinks: 'entryId, journeyId, creatorId, stageId, stopId, createdAt',
      journeySnapshots: 'journeyId, cachedAt',
      localChecklistItems: 'id, journeyId, creatorId, syncStatus, position',
      localJourneyGuides: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStages: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneyStops: 'id, journeyId, creatorId, syncStatus, updatedAt',
      localJourneys: 'id, creatorId, spaceId, syncStatus, updatedAt',
      localNatureObservations:
        'id, journeyId, creatorId, syncStatus, createdAt',
      natureGuideCache: 'id, journeyId, fetchedAt',
      localPhotoTagAssignments:
        'key, photoId, journeyId, creatorId, tagId, syncStatus',
      photos: 'id, entryId, creatorId, syncStatus, createdAt',
      photoVariants: 'id, photoId, kind, createdAt',
      syncOperations: 'id, creatorId, status, createdAt, lastAttemptAt',
    })
  }
}

export const localDb = new TripDiaryDatabase()
