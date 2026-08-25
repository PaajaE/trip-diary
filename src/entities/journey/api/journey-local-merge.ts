import {
  journeyDetailSchema,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import { compareJourneyEntriesNewestFirst } from '@/entities/journey/lib/compare-journey-entries'
import { listLocalJourneyLinks } from '@/entities/journey/api/local-journey-link.repository'
import {
  listLocalJourneyGuides,
  listLocalJourneyStages,
  listLocalJourneyStops,
} from '@/entities/journey/api/local-journey-structure.repository'
import { localDb } from '@/shared/lib/local-db'
import { listDeletedRecordIds } from '@/shared/lib/local-deleted-records'

export interface LocalSavedMoment {
  body: string
  createdAt?: string | null
  entryId: string
  entrySlug: string | null
  entryTitle: string
  eventAt: string | null
  type: JourneyDetail['entries'][number]['type']
}

export function pickJourneyQueryData(
  left: JourneyDetail | undefined,
  right: JourneyDetail | undefined,
): JourneyDetail | undefined {
  if (left === undefined) {
    return right
  }
  if (right === undefined) {
    return left
  }

  return left.entries.length >= right.entries.length ? left : right
}

export function patchJourneyEntryText(
  journey: JourneyDetail,
  patch: {
    body: string
    entryId: string
    slug?: string | null
    syncStatus?: JourneyDetail['entries'][number]['syncStatus']
    title: string
  },
): JourneyDetail {
  return journeyDetailSchema.parse({
    ...journey,
    entries: journey.entries.map((entry) => {
      if (entry.id !== patch.entryId) {
        return entry
      }

      return {
        ...entry,
        body: patch.body,
        title: patch.title,
        ...(patch.slug === undefined ? {} : { slug: patch.slug }),
        ...(patch.syncStatus === undefined
          ? {}
          : { syncStatus: patch.syncStatus }),
      }
    }),
  })
}

function shouldPreferLocalEntryContent(
  syncStatus: string | undefined,
): boolean {
  return (
    syncStatus === 'failed' ||
    syncStatus === 'local' ||
    syncStatus === 'pending' ||
    syncStatus === 'syncing'
  )
}

export function upsertJourneyEntryFromLocalSave(
  journey: JourneyDetail,
  saved: LocalSavedMoment,
): JourneyDetail {
  const nextEntry: JourneyDetail['entries'][number] = {
    body: saved.body,
    createdAt: saved.createdAt ?? new Date().toISOString(),
    eventAt: saved.eventAt,
    id: saved.entryId,
    slug: saved.entrySlug,
    stageId: null,
    stopId: null,
    syncStatus: 'pending',
    title: saved.entryTitle,
    type: saved.type,
  }
  const entries = [
    nextEntry,
    ...journey.entries.filter((entry) => entry.id !== saved.entryId),
  ].sort(sortEntriesByEventAt)

  return journeyDetailSchema.parse({
    ...journey,
    entries,
  })
}

function sortEntriesByEventAt(
  left: JourneyDetail['entries'][number],
  right: JourneyDetail['entries'][number],
): number {
  return compareJourneyEntriesNewestFirst(
    {
      createdAt: left.createdAt ?? null,
      eventAt: left.eventAt,
      id: left.id,
    },
    {
      createdAt: right.createdAt ?? null,
      eventAt: right.eventAt,
      id: right.id,
    },
  )
}

export async function applyLocalJourneyDeltas(
  journey: JourneyDetail,
): Promise<JourneyDetail> {
  if (await isJourneyDeleted(journey.id)) {
    return journey
  }

  const [localLinks, localStages, localStops, localGuides] = await Promise.all([
    listLocalJourneyLinks(journey.id),
    listLocalJourneyStages(journey.id),
    listLocalJourneyStops(journey.id),
    listLocalJourneyGuides(journey.id),
  ])
  const localLinksByEntryId = new Map(
    localLinks.map((link) => [link.entryId, link]),
  )
  const candidateEntryIds = [
    ...journey.entries.map((entry) => entry.id),
    ...localLinks.map((link) => link.entryId),
  ]
  const deletedEntryIds = await listDeletedRecordIds('entry', candidateEntryIds)
  const deletedStageIds = await listDeletedRecordIds('stage', [
    ...journey.stages.map((stage) => stage.id),
    ...localStages.map((stage) => stage.id),
  ])
  const deletedStopIds = await listDeletedRecordIds('stop', [
    ...journey.stops.map((stop) => stop.id),
    ...localStops.map((stop) => stop.id),
  ])
  const deletedGuideIds = await listDeletedRecordIds('guide', [
    ...journey.guides.map((guide) => guide.id),
    ...localGuides.map((guide) => guide.id),
  ])
  const knownEntryIds = new Set(journey.entries.map((entry) => entry.id))
  const knownStopIds = new Set(journey.stops.map((stop) => stop.id))
  const localOnlyEntryIds = localLinks
    .map((link) => link.entryId)
    .filter((entryId) => !knownEntryIds.has(entryId))

  const localEntryIds = [
    ...journey.entries.map((entry) => entry.id),
    ...localOnlyEntryIds,
  ]
  const localEntries =
    localEntryIds.length === 0
      ? []
      : await localDb.entries.where('id').anyOf(localEntryIds).toArray()
  const localEntriesById = new Map(
    localEntries.map((entry) => [entry.id, entry]),
  )

  const mergedEntries = journey.entries
    .filter((entry) => !deletedEntryIds.has(entry.id))
    .map((entry) => {
      const localEntry = localEntriesById.get(entry.id)
      const link = localLinksByEntryId.get(entry.id)
      if (localEntry === undefined && link === undefined) {
        return entry
      }

      const contentSource =
        localEntry !== undefined &&
        shouldPreferLocalEntryContent(localEntry.syncStatus)
          ? localEntry
          : entry

      return {
        body: contentSource.body,
        createdAt: localEntry?.createdAt ?? entry.createdAt,
        // Prefer remote eventAt/title/body once the local row is synced —
        // otherwise stale Dexie values shadow server edits (and e2e admin updates).
        eventAt: contentSource.eventAt,
        id: entry.id,
        slug: contentSource.slug,
        stageId: link?.stageId ?? entry.stageId,
        stopId: link?.stopId ?? entry.stopId,
        syncStatus: localEntry?.syncStatus ?? entry.syncStatus ?? 'synced',
        title: contentSource.title,
        type: contentSource.type,
      }
    })

  const newEntries = localOnlyEntryIds
    .filter((entryId) => !deletedEntryIds.has(entryId))
    .flatMap((entryId) => {
      const entry = localEntriesById.get(entryId)
      const link = localLinksByEntryId.get(entryId)
      if (entry === undefined) {
        return []
      }

      return [
        {
          body: entry.body,
          createdAt: entry.createdAt,
          eventAt: entry.eventAt,
          id: entry.id,
          slug: entry.slug,
          stageId: link?.stageId ?? null,
          stopId: link?.stopId ?? null,
          syncStatus: entry.syncStatus,
          title: entry.title,
          type: entry.type,
        },
      ]
    })

  const newStopsFromLinks = localLinks.flatMap((link) =>
    link.stopId === null ||
    !Number.isFinite(link.latitude) ||
    !Number.isFinite(link.longitude) ||
    knownStopIds.has(link.stopId)
      ? []
      : [
          {
            id: link.stopId,
            mapLatitude: link.latitude ?? null,
            mapLongitude: link.longitude ?? null,
            notes: '',
            stageId: link.stageId,
            status: 'visited' as const,
            title: link.locationTitle ?? '',
          },
        ],
  )

  const knownStageIds = new Set(journey.stages.map((stage) => stage.id))
  const newStages = localStages
    .filter((stage) => !knownStageIds.has(stage.id))
    .map((stage) => ({
      id: stage.id,
      summary: stage.summary,
      title: stage.title,
    }))
  const mergedStages = [
    ...journey.stages.filter((stage) => !deletedStageIds.has(stage.id)),
    ...newStages,
  ]

  const newStops = localStops
    .filter((stop) => !knownStopIds.has(stop.id))
    .map((stop) => ({
      id: stop.id,
      mapLatitude: stop.mapLatitude,
      mapLongitude: stop.mapLongitude,
      notes: stop.notes,
      stageId: stop.stageId,
      status: stop.status,
      title: stop.title,
    }))
  const mergedStops = [
    ...journey.stops
      .filter((stop) => !deletedStopIds.has(stop.id))
      .map((stop) => {
        const localStop = localStops.find(
          (candidate) => candidate.id === stop.id,
        )
        if (localStop === undefined) {
          return stop
        }

        return {
          ...stop,
          mapLatitude: localStop.mapLatitude ?? stop.mapLatitude,
          mapLongitude: localStop.mapLongitude ?? stop.mapLongitude,
          notes: localStop.notes,
          stageId: localStop.stageId,
          status: localStop.status,
          title: localStop.title,
        }
      }),
    ...newStops,
    ...newStopsFromLinks,
  ]

  const knownGuideIds = new Set(journey.guides.map((guide) => guide.id))
  const newGuides = localGuides
    .filter((guide) => !knownGuideIds.has(guide.id))
    .map((guide) => ({
      body: guide.body,
      id: guide.id,
      title: guide.title,
    }))
  const mergedGuides = [
    ...journey.guides.filter((guide) => !deletedGuideIds.has(guide.id)),
    ...newGuides,
  ]

  const withEntries = [...mergedEntries, ...newEntries].sort(
    sortEntriesByEventAt,
  )

  if (
    localEntries.length === 0 &&
    localLinks.length === 0 &&
    localStages.length === 0 &&
    localStops.length === 0 &&
    localGuides.length === 0 &&
    deletedEntryIds.size === 0 &&
    deletedStageIds.size === 0 &&
    deletedStopIds.size === 0 &&
    deletedGuideIds.size === 0
  ) {
    return journey
  }

  return journeyDetailSchema.parse({
    ...journey,
    entries: withEntries,
    guides: mergedGuides,
    stages: mergedStages,
    stops: mergedStops,
  })
}

async function isJourneyDeleted(journeyId: string): Promise<boolean> {
  const deleted = await listDeletedRecordIds('journey', [journeyId])
  return deleted.has(journeyId)
}
