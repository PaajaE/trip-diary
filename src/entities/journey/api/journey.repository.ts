import {
  journeyDetailSchema,
  type CreateJourneyInput,
  type JourneyDetail,
} from '@/entities/journey/model/journey'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function createJourney(
  creatorId: string,
  input: CreateJourneyInput,
): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await getSupabaseClient().from('journeys').insert({
    creator_id: creatorId,
    ends_at: input.endsAt,
    id,
    starts_at: input.startsAt,
    summary: input.summary,
    title: input.title,
    visibility: 'public',
  })
  if (error !== null) {
    throw error
  }
  return id
}

export async function getJourney(id: string): Promise<JourneyDetail | null> {
  const client = getSupabaseClient()
  const [journeyResult, stagesResult, stopsResult, guidesResult] =
    await Promise.all([
      client
        .from('journeys')
        .select('id, title, summary, status, starts_at, ends_at')
        .eq('id', id)
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
    ])

  const error =
    journeyResult.error ??
    stagesResult.error ??
    stopsResult.error ??
    guidesResult.error
  if (error !== null) {
    throw error
  }
  if (journeyResult.data === null) {
    return null
  }

  return journeyDetailSchema.parse({
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
    summary: journeyResult.data.summary,
    title: journeyResult.data.title,
  })
}

export async function canContributeToJourney(id: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc('is_journey_member', {
    p_journey_id: id,
  })
  if (error !== null) {
    return false
  }
  return data
}

export async function addJourneyStage(
  journeyId: string,
  title: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('create_journey_stage', {
    p_journey_id: journeyId,
    p_title: title,
  })
  if (error !== null) {
    throw error
  }
}

export async function addJourneyStop(
  journeyId: string,
  stageId: string,
  title: string,
): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('create_journey_stop', {
    p_journey_id: journeyId,
    p_stage_id: stageId,
    p_title: title,
  })
  if (error !== null) {
    throw error
  }
  return data
}

export async function setJourneyStopLocation(
  stopId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
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

export async function addJourneyGuide(
  journeyId: string,
  title: string,
  body: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc(
    'create_journey_guide_section',
    { p_body: body, p_journey_id: journeyId, p_title: title },
  )
  if (error !== null) {
    throw error
  }
}
