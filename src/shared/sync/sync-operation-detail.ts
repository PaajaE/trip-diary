import { localDb } from '@/shared/lib/local-db'
import type { SyncOperation } from '@/shared/sync/sync-operation'

export async function resolveSyncOperationDetail(
  operation: SyncOperation,
): Promise<string> {
  switch (operation.type) {
    case 'entry.create':
    case 'entry.update':
    case 'entry.delete': {
      const entry = await localDb.entries.get(operation.entryId)
      return entry?.title ?? ''
    }
    case 'journey.create': {
      const journey = await localDb.localJourneys.get(operation.journeyId)
      return journey?.title ?? ''
    }
    case 'journey.update':
    case 'journey.delete': {
      const snapshot = await localDb.journeySnapshots.get(operation.journeyId)
      return snapshot?.journey.title ?? ''
    }
    case 'stage.create':
    case 'stage.update':
    case 'stage.delete': {
      const stage = await localDb.localJourneyStages.get(operation.stageId)
      if (stage !== undefined) {
        return stage.title
      }
      const snapshot = await localDb.journeySnapshots.get(operation.journeyId)
      return (
        snapshot?.journey.stages.find((item) => item.id === operation.stageId)
          ?.title ?? ''
      )
    }
    case 'stop.create':
    case 'stop.update':
    case 'stop.delete': {
      const stop = await localDb.localJourneyStops.get(operation.stopId)
      if (stop !== undefined) {
        return stop.title
      }
      const snapshot = await localDb.journeySnapshots.get(operation.journeyId)
      return (
        snapshot?.journey.stops.find((item) => item.id === operation.stopId)
          ?.title ?? ''
      )
    }
    case 'guide.create':
    case 'guide.update':
    case 'guide.delete': {
      const guide = await localDb.localJourneyGuides.get(operation.guideId)
      if (guide !== undefined) {
        return guide.title
      }
      const snapshot = await localDb.journeySnapshots.get(operation.journeyId)
      return (
        snapshot?.journey.guides.find((item) => item.id === operation.guideId)
          ?.title ?? ''
      )
    }
    case 'journey.assignment.upsert': {
      const entry = await localDb.entries.get(operation.entryId)
      return entry?.title ?? ''
    }
    case 'photo.upload': {
      const photo = await localDb.photos.get(operation.photoId)
      if (photo === undefined) {
        return ''
      }
      const entry = await localDb.entries.get(photo.entryId)
      return entry?.title ?? ''
    }
    case 'photo.gps.update': {
      const photo = await localDb.photos.get(operation.photoId)
      if (photo === undefined) {
        return ''
      }
      const entry = await localDb.entries.get(photo.entryId)
      return entry?.title ?? ''
    }
    case 'photo.delete': {
      const entry = await localDb.entries.get(operation.entryId)
      return entry?.title ?? ''
    }
    case 'photo.tag.assign':
      return operation.label
    case 'photo.tag.remove':
      return operation.slug
    case 'checklist_item.create':
    case 'checklist_item.update': {
      const item = await localDb.localChecklistItems.get(
        operation.checklistItemId,
      )
      return item?.title ?? ''
    }
    case 'observation.create':
    case 'observation.update': {
      const observation = await localDb.localNatureObservations.get(
        operation.observationId,
      )
      return observation?.commonName ?? ''
    }
  }
}
