import {
  journeyDetailSchema,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import {
  localJourneyGuideSchema,
  localJourneyStageSchema,
  localJourneyStopSchema,
} from '@/entities/journey/model/local-journey-structure'
import {
  getJourneySnapshot,
  saveJourneySnapshot,
} from '@/entities/journey/api/local-journey-cache.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import {
  clearDeletedRecord,
  markDeletedRecord,
} from '@/shared/lib/local-deleted-records'
import { isBrowserOnline } from '@/shared/lib/network'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function addJourneyStage(
  creatorId: string,
  journeyId: string,
  title: string,
  summary = '',
): Promise<void> {
  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient().rpc('create_journey_stage', {
        p_journey_id: journeyId,
        p_summary: summary,
        p_title: title,
      })
      if (error === null) {
        return
      }
    } catch {
      // Fall back to local queue when remote stage creation fails.
    }
  }

  await createLocalJourneyStage(creatorId, journeyId, title, summary)
}

export async function addJourneyStop(
  creatorId: string,
  journeyId: string,
  stageId: string | null,
  title: string,
  notes = '',
): Promise<string> {
  if (isBrowserOnline()) {
    try {
      const { data, error } = await getSupabaseClient().rpc(
        'create_journey_stop',
        {
          p_journey_id: journeyId,
          p_notes: notes,
          p_stage_id: stageId as never,
          p_title: title,
        },
      )
      if (error === null && typeof data === 'string') {
        return data
      }
    } catch {
      // Fall back to local queue when remote stop creation fails.
    }
  }

  return createLocalJourneyStop(creatorId, journeyId, stageId, title, notes)
}

export async function setJourneyStopLocation(
  stopId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  const localStop = await localDb.localJourneyStops.get(stopId)
  if (localStop !== undefined) {
    const now = new Date().toISOString()
    const updated = localJourneyStopSchema.parse({
      ...localStop,
      mapLatitude: latitude,
      mapLongitude: longitude,
      updatedAt: now,
    })
    await localDb.localJourneyStops.put(updated)
    await patchJourneySnapshotStop(updated)
    return
  }

  if (!isBrowserOnline()) {
    throw new Error('Stop location is unavailable offline')
  }

  const { error } = await getSupabaseClient().rpc('set_journey_stop_location', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_map_latitude: Math.round(latitude * 100) / 100,
    p_map_longitude: Math.round(longitude * 100) / 100,
    p_stop_id: stopId,
  })
  if (error !== null) {
    throw error
  }
}

export async function setJourneyStopStatus(
  creatorId: string,
  journeyId: string,
  stopId: string,
  status: 'planned' | 'visited',
): Promise<void> {
  const localStop = await localDb.localJourneyStops.get(stopId)
  if (localStop !== undefined) {
    const now = new Date().toISOString()
    const updated = localJourneyStopSchema.parse({
      ...localStop,
      status,
      updatedAt: now,
    })
    await localDb.localJourneyStops.put(updated)
    await patchJourneySnapshotStop(updated)
    return
  }

  const snapshot = await getJourneySnapshot(journeyId)
  const snapshotStop = snapshot?.journey.stops.find(
    (item) => item.id === stopId,
  )
  if (snapshotStop !== undefined) {
    await patchStopStatusInSnapshot(journeyId, stopId, status)
  }

  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient()
        .from('journey_stops')
        .update({
          status,
          visited_at: status === 'visited' ? new Date().toISOString() : null,
        })
        .eq('id', stopId)
      if (error === null) {
        return
      }
    } catch {
      // Fall back to local queue when remote stop update fails.
    }
  }

  await queueStopUpdate(creatorId, journeyId, stopId)
}

export async function addJourneyGuide(
  creatorId: string,
  journeyId: string,
  title: string,
  body: string,
): Promise<void> {
  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient().rpc(
        'create_journey_guide_section',
        { p_body: body, p_journey_id: journeyId, p_title: title },
      )
      if (error === null) {
        return
      }
    } catch {
      // Fall back to local queue when remote guide creation fails.
    }
  }

  await createLocalJourneyGuide(creatorId, journeyId, title, body)
}

export async function updateJourneyStage(
  creatorId: string,
  journeyId: string,
  stageId: string,
  input: { summary: string; title: string },
): Promise<void> {
  const localStage = await localDb.localJourneyStages.get(stageId)
  if (localStage !== undefined) {
    const now = new Date().toISOString()
    const updated = localJourneyStageSchema.parse({
      ...localStage,
      summary: input.summary,
      title: input.title,
      updatedAt: now,
    })
    await localDb.localJourneyStages.put(updated)
    await patchStageInSnapshot(journeyId, {
      id: stageId,
      summary: input.summary,
      title: input.title,
    })
    return
  }

  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient()
        .from('journey_stages')
        .update({ summary: input.summary, title: input.title })
        .eq('id', stageId)
      if (error === null) {
        await patchStageInSnapshot(journeyId, {
          id: stageId,
          summary: input.summary,
          title: input.title,
        })
        return
      }
    } catch {
      // Fall back to local queue when remote stage update fails.
    }
  }

  await patchStageInSnapshot(journeyId, {
    id: stageId,
    summary: input.summary,
    title: input.title,
  })
  await queueStageUpdate(creatorId, journeyId, stageId)
}

export async function deleteJourneyStage(
  creatorId: string,
  journeyId: string,
  stageId: string,
): Promise<void> {
  const localStage = await localDb.localJourneyStages.get(stageId)
  if (localStage !== undefined) {
    await purgePendingStage(stageId)
    await removeStageFromSnapshot(journeyId, stageId)
    return
  }

  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient()
        .from('journey_stages')
        .delete()
        .eq('id', stageId)
      if (error === null) {
        await removeStageFromSnapshot(journeyId, stageId)
        await clearDeletedRecord(stageId)
        return
      }
    } catch {
      // Fall back to local queue when remote stage delete fails.
    }
  }

  await removeStageFromSnapshot(journeyId, stageId)
  await queueStageDelete(creatorId, journeyId, stageId)
}

export async function deleteJourneyStop(
  creatorId: string,
  journeyId: string,
  stopId: string,
): Promise<void> {
  const localStop = await localDb.localJourneyStops.get(stopId)
  if (localStop !== undefined) {
    await purgePendingStop(stopId)
    await removeStopFromSnapshot(journeyId, stopId)
    return
  }

  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient()
        .from('journey_stops')
        .delete()
        .eq('id', stopId)
      if (error === null) {
        await removeStopFromSnapshot(journeyId, stopId)
        await clearDeletedRecord(stopId)
        return
      }
    } catch {
      // Fall back to local queue when remote stop delete fails.
    }
  }

  await removeStopFromSnapshot(journeyId, stopId)
  await queueStopDelete(creatorId, journeyId, stopId)
}

export async function updateJourneyGuide(
  creatorId: string,
  journeyId: string,
  guideId: string,
  input: { body: string; title: string },
): Promise<void> {
  const localGuide = await localDb.localJourneyGuides.get(guideId)
  if (localGuide !== undefined) {
    const now = new Date().toISOString()
    const updated = localJourneyGuideSchema.parse({
      ...localGuide,
      body: input.body,
      title: input.title,
      updatedAt: now,
    })
    await localDb.localJourneyGuides.put(updated)
    await patchGuideInSnapshot(journeyId, {
      body: input.body,
      id: guideId,
      title: input.title,
    })
    return
  }

  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient()
        .from('journey_guide_sections')
        .update({ body: input.body, title: input.title })
        .eq('id', guideId)
      if (error === null) {
        await patchGuideInSnapshot(journeyId, {
          body: input.body,
          id: guideId,
          title: input.title,
        })
        return
      }
    } catch {
      // Fall back to local queue when remote guide update fails.
    }
  }

  await patchGuideInSnapshot(journeyId, {
    body: input.body,
    id: guideId,
    title: input.title,
  })
  await queueGuideUpdate(creatorId, journeyId, guideId)
}

export async function deleteJourneyGuide(
  creatorId: string,
  journeyId: string,
  guideId: string,
): Promise<void> {
  const localGuide = await localDb.localJourneyGuides.get(guideId)
  if (localGuide !== undefined) {
    await purgePendingGuide(guideId)
    await removeGuideFromSnapshot(journeyId, guideId)
    return
  }

  if (isBrowserOnline()) {
    try {
      const { error } = await getSupabaseClient()
        .from('journey_guide_sections')
        .delete()
        .eq('id', guideId)
      if (error === null) {
        await removeGuideFromSnapshot(journeyId, guideId)
        await clearDeletedRecord(guideId)
        return
      }
    } catch {
      // Fall back to local queue when remote guide delete fails.
    }
  }

  await removeGuideFromSnapshot(journeyId, guideId)
  await queueGuideDelete(creatorId, journeyId, guideId)
}

export async function listLocalJourneyStages(journeyId: string) {
  return localDb.localJourneyStages
    .where('journeyId')
    .equals(journeyId)
    .toArray()
}

export async function listLocalJourneyStops(journeyId: string) {
  return localDb.localJourneyStops
    .where('journeyId')
    .equals(journeyId)
    .toArray()
}

export async function listLocalJourneyGuides(journeyId: string) {
  return localDb.localJourneyGuides
    .where('journeyId')
    .equals(journeyId)
    .toArray()
}

async function createLocalJourneyStage(
  creatorId: string,
  journeyId: string,
  title: string,
  summary: string,
): Promise<void> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const position = await nextStagePosition(journeyId)
  const stage = localJourneyStageSchema.parse({
    createdAt: now,
    creatorId,
    id,
    journeyId,
    position,
    summary,
    syncStatus: 'pending',
    title,
    updatedAt: now,
  })
  const operation = syncOperationSchema.parse({
    createdAt: now,
    creatorId,
    id: crypto.randomUUID(),
    journeyId,
    stageId: id,
    status: 'pending',
    type: 'stage.create',
  })

  await localDb.transaction(
    'rw',
    localDb.localJourneyStages,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyStages.add(stage)
      await localDb.syncOperations.add(operation)
    },
  )

  await appendStageToSnapshot(journeyId, {
    id,
    summary,
    title,
  })
}

async function createLocalJourneyStop(
  creatorId: string,
  journeyId: string,
  stageId: string | null,
  title: string,
  notes: string,
): Promise<string> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const position = await nextStopPosition(journeyId)
  const stop = localJourneyStopSchema.parse({
    createdAt: now,
    creatorId,
    id,
    journeyId,
    mapLatitude: null,
    mapLongitude: null,
    notes,
    position,
    stageId,
    status: 'planned',
    syncStatus: 'pending',
    title,
    updatedAt: now,
  })
  const operation = syncOperationSchema.parse({
    createdAt: now,
    creatorId,
    id: crypto.randomUUID(),
    journeyId,
    status: 'pending',
    stopId: id,
    type: 'stop.create',
  })

  await localDb.transaction(
    'rw',
    localDb.localJourneyStops,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyStops.add(stop)
      await localDb.syncOperations.add(operation)
    },
  )

  await appendStopToSnapshot(journeyId, toJourneyStop(stop))
  return id
}

async function createLocalJourneyGuide(
  creatorId: string,
  journeyId: string,
  title: string,
  body: string,
): Promise<void> {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  const position = await nextGuidePosition(journeyId)
  const guide = localJourneyGuideSchema.parse({
    body,
    createdAt: now,
    creatorId,
    id,
    journeyId,
    position,
    syncStatus: 'pending',
    title,
    updatedAt: now,
  })
  const operation = syncOperationSchema.parse({
    createdAt: now,
    creatorId,
    guideId: id,
    id: crypto.randomUUID(),
    journeyId,
    status: 'pending',
    type: 'guide.create',
  })

  await localDb.transaction(
    'rw',
    localDb.localJourneyGuides,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyGuides.add(guide)
      await localDb.syncOperations.add(operation)
    },
  )

  await appendGuideToSnapshot(journeyId, {
    body,
    id,
    title,
  })
}

function toJourneyStop(stop: ReturnType<typeof localJourneyStopSchema.parse>) {
  return {
    id: stop.id,
    mapLatitude: stop.mapLatitude,
    mapLongitude: stop.mapLongitude,
    notes: stop.notes,
    stageId: stop.stageId,
    status: stop.status,
    title: stop.title,
  }
}

async function nextStagePosition(journeyId: string): Promise<number> {
  const [snapshot, localStages] = await Promise.all([
    getJourneySnapshot(journeyId),
    listLocalJourneyStages(journeyId),
  ])
  return (snapshot?.journey.stages.length ?? 0) + localStages.length
}

async function nextStopPosition(journeyId: string): Promise<number> {
  const [snapshot, localStops] = await Promise.all([
    getJourneySnapshot(journeyId),
    listLocalJourneyStops(journeyId),
  ])
  return (snapshot?.journey.stops.length ?? 0) + localStops.length
}

async function nextGuidePosition(journeyId: string): Promise<number> {
  const [snapshot, localGuides] = await Promise.all([
    getJourneySnapshot(journeyId),
    listLocalJourneyGuides(journeyId),
  ])
  return (snapshot?.journey.guides.length ?? 0) + localGuides.length
}

async function appendStageToSnapshot(
  journeyId: string,
  stage: JourneyDetail['stages'][number],
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stages: [...snapshot.journey.stages, stage],
    }),
    snapshot.canContribute,
  )
}

async function appendStopToSnapshot(
  journeyId: string,
  stop: JourneyDetail['stops'][number],
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stops: [...snapshot.journey.stops, stop],
    }),
    snapshot.canContribute,
  )
}

async function patchJourneySnapshotStop(
  stop: ReturnType<typeof localJourneyStopSchema.parse>,
): Promise<void> {
  const snapshot = await getJourneySnapshot(stop.journeyId)
  if (snapshot === null) {
    return
  }

  const journeyStop = toJourneyStop(stop)
  const stops = snapshot.journey.stops.some((item) => item.id === stop.id)
    ? snapshot.journey.stops.map((item) =>
        item.id === stop.id ? journeyStop : item,
      )
    : [...snapshot.journey.stops, journeyStop]

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stops,
    }),
    snapshot.canContribute,
  )
}

async function appendGuideToSnapshot(
  journeyId: string,
  guide: JourneyDetail['guides'][number],
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      guides: [...snapshot.journey.guides, guide],
    }),
    snapshot.canContribute,
  )
}

async function patchStageInSnapshot(
  journeyId: string,
  stage: JourneyDetail['stages'][number],
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stages: snapshot.journey.stages.map((item) =>
        item.id === stage.id ? stage : item,
      ),
    }),
    snapshot.canContribute,
  )
}

async function patchGuideInSnapshot(
  journeyId: string,
  guide: JourneyDetail['guides'][number],
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      guides: snapshot.journey.guides.map((item) =>
        item.id === guide.id ? guide : item,
      ),
    }),
    snapshot.canContribute,
  )
}

async function removeStageFromSnapshot(
  journeyId: string,
  stageId: string,
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stages: snapshot.journey.stages.filter((stage) => stage.id !== stageId),
    }),
    snapshot.canContribute,
  )
}

async function removeStopFromSnapshot(
  journeyId: string,
  stopId: string,
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stops: snapshot.journey.stops.filter((stop) => stop.id !== stopId),
    }),
    snapshot.canContribute,
  )
}

async function removeGuideFromSnapshot(
  journeyId: string,
  guideId: string,
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      guides: snapshot.journey.guides.filter((guide) => guide.id !== guideId),
    }),
    snapshot.canContribute,
  )
}

async function queueStageUpdate(
  creatorId: string,
  journeyId: string,
  stageId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction('rw', localDb.syncOperations, async () => {
    await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'stage.update' && operation.stageId === stageId,
      )
      .delete()
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId,
        id: crypto.randomUUID(),
        journeyId,
        stageId,
        status: 'pending',
        type: 'stage.update',
      }),
    )
  })
}

async function queueStageDelete(
  creatorId: string,
  journeyId: string,
  stageId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await markDeletedRecord({
        creatorId,
        deletedAt: now,
        id: stageId,
        kind: 'stage',
      })
      await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'stage.update' && operation.stageId === stageId,
        )
        .delete()
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId,
          id: crypto.randomUUID(),
          journeyId,
          stageId,
          status: 'pending',
          type: 'stage.delete',
        }),
      )
    },
  )
}

async function patchStopStatusInSnapshot(
  journeyId: string,
  stopId: string,
  status: 'planned' | 'visited',
): Promise<void> {
  const snapshot = await getJourneySnapshot(journeyId)
  if (snapshot === null) {
    return
  }

  await saveJourneySnapshot(
    journeyDetailSchema.parse({
      ...snapshot.journey,
      stops: snapshot.journey.stops.map((stop) =>
        stop.id === stopId ? { ...stop, status } : stop,
      ),
    }),
    snapshot.canContribute,
  )
}

async function queueStopUpdate(
  creatorId: string,
  journeyId: string,
  stopId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction('rw', localDb.syncOperations, async () => {
    await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'stop.update' && operation.stopId === stopId,
      )
      .delete()
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId,
        id: crypto.randomUUID(),
        journeyId,
        stopId,
        status: 'pending',
        type: 'stop.update',
      }),
    )
  })
}

async function queueStopDelete(
  creatorId: string,
  journeyId: string,
  stopId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await markDeletedRecord({
        creatorId,
        deletedAt: now,
        id: stopId,
        kind: 'stop',
      })
      await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'stop.update' && operation.stopId === stopId,
        )
        .delete()
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId,
          id: crypto.randomUUID(),
          journeyId,
          stopId,
          status: 'pending',
          type: 'stop.delete',
        }),
      )
    },
  )
}

async function queueGuideUpdate(
  creatorId: string,
  journeyId: string,
  guideId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction('rw', localDb.syncOperations, async () => {
    await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'guide.update' && operation.guideId === guideId,
      )
      .delete()
    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        createdAt: now,
        creatorId,
        guideId,
        id: crypto.randomUUID(),
        journeyId,
        status: 'pending',
        type: 'guide.update',
      }),
    )
  })
}

async function queueGuideDelete(
  creatorId: string,
  journeyId: string,
  guideId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction(
    'rw',
    localDb.deletedRecords,
    localDb.syncOperations,
    async () => {
      await markDeletedRecord({
        creatorId,
        deletedAt: now,
        id: guideId,
        kind: 'guide',
      })
      await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'guide.update' && operation.guideId === guideId,
        )
        .delete()
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId,
          guideId,
          id: crypto.randomUUID(),
          journeyId,
          status: 'pending',
          type: 'guide.delete',
        }),
      )
    },
  )
}

async function purgePendingStage(stageId: string): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.localJourneyStages,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyStages.delete(stageId)
      await localDb.syncOperations
        .filter(
          (operation) =>
            (operation.type === 'stage.create' ||
              operation.type === 'stage.update') &&
            operation.stageId === stageId,
        )
        .delete()
    },
  )
}

async function purgePendingStop(stopId: string): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.localJourneyStops,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyStops.delete(stopId)
      await localDb.syncOperations
        .filter(
          (operation) =>
            (operation.type === 'stop.create' ||
              operation.type === 'stop.update') &&
            operation.stopId === stopId,
        )
        .delete()
    },
  )
}

async function purgePendingGuide(guideId: string): Promise<void> {
  await localDb.transaction(
    'rw',
    localDb.localJourneyGuides,
    localDb.syncOperations,
    async () => {
      await localDb.localJourneyGuides.delete(guideId)
      await localDb.syncOperations
        .filter(
          (operation) =>
            (operation.type === 'guide.create' ||
              operation.type === 'guide.update') &&
            operation.guideId === guideId,
        )
        .delete()
    },
  )
}
