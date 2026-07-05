import {
  journeyDetailSchema,
  type CreateJourneyInput,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import {
  listLocalJourneyLinks,
  saveLocalJourneyLink,
} from '@/entities/journey/api/local-journey-link.repository'
import { listJourneyChecklistItemsRemote } from '@/entities/checklist/api/checklist.repository'
import {
  getJourneySnapshot,
  saveJourneySnapshot,
  updateJourneySnapshotContribution,
} from '@/entities/journey/api/local-journey-cache.repository'
import {
  addJourneyGuide as addJourneyGuideStructure,
  addJourneyStage as addJourneyStageStructure,
  addJourneyStop as addJourneyStopStructure,
  deleteJourneyGuide as deleteJourneyGuideStructure,
  deleteJourneyStage as deleteJourneyStageStructure,
  deleteJourneyStop as deleteJourneyStopStructure,
  setJourneyStopLocation as setJourneyStopLocationStructure,
  updateJourneyGuide as updateJourneyGuideStructure,
  updateJourneyStage as updateJourneyStageStructure,
} from '@/entities/journey/api/local-journey-structure.repository'
import { listJourneyObservationsRemote } from '@/entities/nature/api/observation.repository'
import {
  applyLocalJourneyDeltas,
  type LocalSavedMoment,
  upsertJourneyEntryFromLocalSave,
} from '@/entities/journey/api/journey-local-merge'
import { createLocalJourney } from '@/entities/journey/api/local-journey.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { isRecordDeleted } from '@/shared/lib/local-deleted-records'
import { isBrowserOnline } from '@/shared/lib/network'
import { createPublicSlug } from '@/shared/lib/slug'

export async function createJourney(
  creatorId: string,
  spaceId: string,
  input: CreateJourneyInput,
): Promise<string> {
  if (!isBrowserOnline()) {
    return createLocalJourney(creatorId, spaceId, input)
  }

  const id = crypto.randomUUID()
  try {
    const { error } = await getSupabaseClient()
      .from('journeys')
      .insert({
        creator_id: creatorId,
        ends_at: input.endsAt,
        id,
        slug: createPublicSlug(input.title, id),
        space_id: spaceId,
        starts_at: input.startsAt,
        summary: input.summary,
        title: input.title,
        visibility: 'public',
      })
    if (error !== null) {
      throw error
    }
    return id
  } catch {
    return createLocalJourney(creatorId, spaceId, input)
  }
}

export async function getJourneyFromCache(
  id: string,
): Promise<JourneyDetail | null> {
  if (await isRecordDeleted('journey', id)) {
    return null
  }

  const snapshot = await getJourneySnapshot(id)
  if (snapshot === null) {
    return null
  }

  return applyLocalJourneyDeltas(snapshot.journey)
}

export async function persistMergedJourneyCache(
  id: string,
  savedMoment?: LocalSavedMoment,
): Promise<JourneyDetail | null> {
  const merged = await getJourneyFromCache(id)
  if (merged === null) {
    return null
  }

  const withSavedMoment =
    savedMoment === undefined
      ? merged
      : upsertJourneyEntryFromLocalSave(merged, savedMoment)
  const canContribute = await getCachedCanContributeToJourney(id)
  await saveJourneySnapshot(withSavedMoment, canContribute ?? true)
  return withSavedMoment
}

export type { LocalSavedMoment }
export { upsertJourneyEntryFromLocalSave }

export async function getCachedCanContributeToJourney(
  id: string,
): Promise<boolean | undefined> {
  const snapshot = await getJourneySnapshot(id)
  return snapshot?.canContribute
}

export async function getJourney(id: string): Promise<JourneyDetail | null> {
  if (await isRecordDeleted('journey', id)) {
    return null
  }

  if (isBrowserOnline()) {
    try {
      const journey = await fetchJourneyFromRemote(id)
      if (journey === null) {
        return await getJourneyFromCache(id)
      }
      const merged = await applyLocalJourneyDeltas(journey)
      const canContribute = await resolveCanContributeForSnapshot(id)
      const [checklistItems, observations] = await Promise.all([
        listJourneyChecklistItemsRemote(id).catch(() => []),
        listJourneyObservationsRemote(id).catch(() => []),
      ])
      await saveJourneySnapshot(merged, canContribute, {
        checklistItems,
        observations,
      })
      return merged
    } catch {
      // Fall back to the last cached snapshot when the remote read fails.
    }
  }

  return getJourneyFromCache(id)
}

export async function getPublicJourney(
  id: string,
): Promise<JourneyDetail | null> {
  if (!isBrowserOnline()) {
    return null
  }

  return fetchPublicJourneyFromRemote(id)
}

async function fetchPublicJourneyFromRemote(
  id: string,
): Promise<JourneyDetail | null> {
  const client = getSupabaseClient()
  const [journeyResult, stagesResult, stopsResult, guidesResult, linksResult] =
    await Promise.all([
      client
        .from('journeys')
        .select('id, title, summary, status, starts_at, ends_at, space_id')
        .eq('id', id)
        .eq('visibility', 'public')
        .maybeSingle(),
      client
        .from('journey_stages')
        .select('id, title, summary')
        .eq('journey_id', id)
        .order('position'),
      client
        .from('journey_stops')
        .select(
          'id, stage_id, title, notes, status, map_latitude, map_longitude',
        )
        .eq('journey_id', id)
        .order('position'),
      client
        .from('journey_guide_sections')
        .select('id, title, body')
        .eq('journey_id', id)
        .order('position'),
      client
        .from('entry_journey_links')
        .select('entry_id, stage_id, stop_id')
        .eq('journey_id', id),
    ])

  const error =
    journeyResult.error ??
    stagesResult.error ??
    stopsResult.error ??
    guidesResult.error ??
    linksResult.error
  if (error !== null) {
    throw error
  }
  if (journeyResult.data === null) {
    return null
  }

  const links = linksResult.data ?? []
  const entryIds = links.map((link) => link.entry_id)
  const entriesResult =
    entryIds.length === 0
      ? { data: [], error: null }
      : await client
          .from('entries')
          .select('id, title, body, type, event_at, slug')
          .in('id', entryIds)
          .eq('status', 'published')
          .eq('visibility', 'public')

  if (entriesResult.error !== null) {
    throw entriesResult.error
  }

  const linksByEntryId = new Map(links.map((link) => [link.entry_id, link]))
  const publishedEntries = entriesResult.data

  return journeyDetailSchema.parse({
    entries: publishedEntries
      .map((entry) => {
        const link = linksByEntryId.get(entry.id)
        return {
          body: entry.body,
          eventAt: entry.event_at,
          id: entry.id,
          slug: entry.slug,
          stageId: link?.stage_id ?? null,
          stopId: link?.stop_id ?? null,
          title: entry.title,
          type: entry.type,
        }
      })
      .sort((left, right) => {
        const leftTime =
          left.eventAt === null ? 0 : new Date(left.eventAt).valueOf()
        const rightTime =
          right.eventAt === null ? 0 : new Date(right.eventAt).valueOf()
        return rightTime - leftTime
      }),
    endsAt: journeyResult.data.ends_at,
    guides: guidesResult.data,
    id: journeyResult.data.id,
    stages: stagesResult.data,
    startsAt: journeyResult.data.starts_at,
    status: journeyResult.data.status,
    stops: (stopsResult.data ?? []).map((stop) => ({
      id: stop.id,
      mapLatitude: stop.map_latitude,
      mapLongitude: stop.map_longitude,
      notes: stop.notes,
      stageId: stop.stage_id,
      status: stop.status,
      title: stop.title,
    })),
    spaceId: journeyResult.data.space_id,
    summary: journeyResult.data.summary,
    title: journeyResult.data.title,
  })
}

async function fetchJourneyFromRemote(
  id: string,
): Promise<JourneyDetail | null> {
  const client = getSupabaseClient()
  const [
    journeyResult,
    stagesResult,
    stopsResult,
    guidesResult,
    linksResult,
    localLinks,
  ] = await Promise.all([
    client
      .from('journeys')
      .select('id, title, summary, status, starts_at, ends_at, space_id')
      .eq('id', id)
      .maybeSingle(),
    client
      .from('journey_stages')
      .select('id, title, summary')
      .eq('journey_id', id)
      .order('position'),
    client
      .from('journey_stops')
      .select('id, stage_id, title, notes, status, map_latitude, map_longitude')
      .eq('journey_id', id)
      .order('position'),
    client
      .from('journey_guide_sections')
      .select('id, title, body')
      .eq('journey_id', id)
      .order('position'),
    client
      .from('entry_journey_links')
      .select('entry_id, stage_id, stop_id')
      .eq('journey_id', id),
    listLocalJourneyLinks(id),
  ])

  const error =
    journeyResult.error ??
    stagesResult.error ??
    stopsResult.error ??
    guidesResult.error ??
    linksResult.error
  if (error !== null) {
    throw error
  }
  if (journeyResult.data === null) {
    return null
  }

  const entryIds = (linksResult.data ?? []).map((link) => link.entry_id)
  const localOnlyEntryIds = localLinks
    .map((link) => link.entryId)
    .filter((entryId) => !entryIds.includes(entryId))
  const entriesResult =
    entryIds.length === 0
      ? { data: [], error: null }
      : await client
          .from('entries')
          .select('id, title, body, type, event_at, slug')
          .in('id', entryIds)

  if (entriesResult.error !== null) {
    throw entriesResult.error
  }

  const localEntries =
    localOnlyEntryIds.length === 0
      ? []
      : await localDb.entries.where('id').anyOf(localOnlyEntryIds).toArray()

  const linksByEntryId = new Map(
    (linksResult.data ?? []).map((link) => [link.entry_id, link]),
  )
  const localLinksByEntryId = new Map(
    localLinks.map((link) => [link.entryId, link]),
  )
  const serverStops = (stopsResult.data ?? []).map((stop) => ({
    id: stop.id,
    mapLatitude: stop.map_latitude,
    mapLongitude: stop.map_longitude,
    notes: stop.notes,
    stageId: stop.stage_id,
    status: stop.status,
    title: stop.title,
  }))
  const serverStopIds = new Set(serverStops.map((stop) => stop.id))
  const localStops = localLinks.flatMap((link) =>
    link.stopId === null ||
    !Number.isFinite(link.latitude) ||
    !Number.isFinite(link.longitude) ||
    serverStopIds.has(link.stopId)
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

  return journeyDetailSchema.parse({
    entries: [
      ...entriesResult.data.map((entry) => {
        const link = linksByEntryId.get(entry.id)
        return {
          body: entry.body,
          eventAt: entry.event_at,
          id: entry.id,
          slug: entry.slug,
          stageId: link?.stage_id ?? null,
          stopId: link?.stop_id ?? null,
          title: entry.title,
          type: entry.type,
        }
      }),
      ...localEntries.map((entry) => {
        const link = localLinksByEntryId.get(entry.id)
        return {
          body: entry.body,
          eventAt: entry.eventAt,
          id: entry.id,
          slug: entry.slug,
          stageId: link?.stageId ?? null,
          stopId: link?.stopId ?? null,
          title: entry.title,
          type: entry.type,
        }
      }),
    ].sort((left, right) => {
      const leftTime =
        left.eventAt === null ? 0 : new Date(left.eventAt).valueOf()
      const rightTime =
        right.eventAt === null ? 0 : new Date(right.eventAt).valueOf()
      return rightTime - leftTime
    }),
    endsAt: journeyResult.data.ends_at,
    guides: guidesResult.data,
    id: journeyResult.data.id,
    stages: stagesResult.data,
    startsAt: journeyResult.data.starts_at,
    status: journeyResult.data.status,
    stops: [...serverStops, ...localStops],
    spaceId: journeyResult.data.space_id,
    summary: journeyResult.data.summary,
    title: journeyResult.data.title,
  })
}

async function fetchCanContributeFromRemote(id: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('is_journey_member', {
    p_journey_id: id,
  })
  if (error !== null) {
    throw error
  }
  return data
}

async function resolveCanContributeForSnapshot(
  journeyId: string,
): Promise<boolean> {
  try {
    return await fetchCanContributeFromRemote(journeyId)
  } catch {
    const snapshot = await getJourneySnapshot(journeyId)
    return snapshot?.canContribute ?? false
  }
}

export async function canContributeToJourney(id: string): Promise<boolean> {
  if (isBrowserOnline()) {
    try {
      const canContribute = await fetchCanContributeFromRemote(id)
      await updateJourneySnapshotContribution(id, canContribute)
      return canContribute
    } catch {
      // Fall back to the cached contribution flag when the remote check fails.
    }
  }

  const snapshot = await getJourneySnapshot(id)
  return snapshot?.canContribute ?? false
}

export async function addJourneyStage(
  creatorId: string,
  journeyId: string,
  title: string,
  summary = '',
): Promise<void> {
  await addJourneyStageStructure(creatorId, journeyId, title, summary)
}

export async function addJourneyStop(
  creatorId: string,
  journeyId: string,
  stageId: string | null,
  title: string,
  notes = '',
): Promise<string> {
  return addJourneyStopStructure(creatorId, journeyId, stageId, title, notes)
}

export async function setJourneyStopLocation(
  stopId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await setJourneyStopLocationStructure(stopId, latitude, longitude)
}

export async function addJourneyGuide(
  creatorId: string,
  journeyId: string,
  title: string,
  body: string,
): Promise<void> {
  await addJourneyGuideStructure(creatorId, journeyId, title, body)
}

export async function updateJourneyStage(
  creatorId: string,
  journeyId: string,
  stageId: string,
  input: { summary: string; title: string },
): Promise<void> {
  await updateJourneyStageStructure(creatorId, journeyId, stageId, input)
}

export async function deleteJourneyStage(
  creatorId: string,
  journeyId: string,
  stageId: string,
): Promise<void> {
  await deleteJourneyStageStructure(creatorId, journeyId, stageId)
}

export async function deleteJourneyStop(
  creatorId: string,
  journeyId: string,
  stopId: string,
): Promise<void> {
  await deleteJourneyStopStructure(creatorId, journeyId, stopId)
}

export async function updateJourneyGuide(
  creatorId: string,
  journeyId: string,
  guideId: string,
  input: { body: string; title: string },
): Promise<void> {
  await updateJourneyGuideStructure(creatorId, journeyId, guideId, input)
}

export async function deleteJourneyGuide(
  creatorId: string,
  journeyId: string,
  guideId: string,
): Promise<void> {
  await deleteJourneyGuideStructure(creatorId, journeyId, guideId)
}

export async function linkEntryToJourney(input: {
  creatorId: string
  entryId: string
  journeyId: string
  stageId?: string | null
  stopId?: string | null
}): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('entry_journey_links')
    .upsert(
      {
        creator_id: input.creatorId,
        entry_id: input.entryId,
        journey_id: input.journeyId,
        stage_id: input.stageId ?? null,
        stop_id: input.stopId ?? null,
      },
      { ignoreDuplicates: false, onConflict: 'entry_id' },
    )

  if (error !== null) {
    throw error
  }
}

export async function moveJourneyMomentToStage(input: {
  creatorId: string
  entryId: string
  journeyId: string
  stageId: string | null
  stopId: string | null
}): Promise<void> {
  const localLink = await localDb.journeyLinks.get(input.entryId)

  if (!isBrowserOnline() || localLink !== undefined) {
    await saveLocalJourneyLink({
      creatorId: localLink?.creatorId ?? input.creatorId,
      entryId: input.entryId,
      journeyId: input.journeyId,
      latitude: localLink?.latitude ?? null,
      locationTitle: localLink?.locationTitle ?? null,
      longitude: localLink?.longitude ?? null,
      stageId: input.stageId,
      stopId: input.stopId,
    })
    return
  }

  const { error } = await getSupabaseClient().rpc(
    'upsert_journey_moment_assignment',
    {
      p_entry_id: input.entryId,
      p_journey_id: input.journeyId,
      p_stage_id: input.stageId as never,
      p_stop_id: input.stopId as never,
    },
  )
  if (error !== null) {
    throw error
  }
}
