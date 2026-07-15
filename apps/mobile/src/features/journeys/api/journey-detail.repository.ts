import { parseJourneyHeaderFromRemoteRecord } from '@trip-diary/core/journey'
import type {
  JourneyEntry,
  JourneyFullDetail,
  JourneyStage,
} from '@/features/journeys/model/journey-detail'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import { JourneyRepositoryError } from '@/features/journeys/api/journeys.repository'

function mapStage(row: Record<string, unknown>): JourneyStage {
  return {
    id: String(row.id),
    summary: typeof row.summary === 'string' ? row.summary : '',
    title: typeof row.title === 'string' ? row.title : '',
  }
}

function mapEntry(
  row: Record<string, unknown>,
  link: { stage_id: string | null; stop_id: string | null } | undefined,
): JourneyEntry {
  return {
    body: typeof row.body === 'string' ? row.body : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    eventAt: typeof row.event_at === 'string' ? row.event_at : null,
    id: String(row.id),
    slug: typeof row.slug === 'string' ? row.slug : null,
    stageId: link?.stage_id ?? null,
    stopId: link?.stop_id ?? null,
    title: typeof row.title === 'string' ? row.title : null,
    type:
      row.type === 'tip' ||
      row.type === 'note' ||
      row.type === 'place' ||
      row.type === 'story'
        ? row.type
        : 'story',
  }
}

export async function fetchJourneyFullDetail(
  journeyId: string,
): Promise<JourneyFullDetail> {
  if (!isSupabaseConfigured()) {
    throw new JourneyRepositoryError(
      'Supabase is not configured.',
      'NOT_CONFIGURED',
    )
  }

  const client = getSupabaseClient()
  const [journeyResult, stagesResult, stopsResult, linksResult] =
    await Promise.all([
      client
        .from('journeys')
        .select('id, title, summary, status, starts_at, ends_at, space_id')
        .eq('id', journeyId)
        .maybeSingle(),
      client
        .from('journey_stages')
        .select('id, title, summary')
        .eq('journey_id', journeyId)
        .order('position'),
      client
        .from('journey_stops')
        .select(
          'id, stage_id, title, notes, status, map_latitude, map_longitude, position',
        )
        .eq('journey_id', journeyId)
        .order('position'),
      client
        .from('entry_journey_links')
        .select('entry_id, stage_id, stop_id')
        .eq('journey_id', journeyId),
    ])

  const error =
    journeyResult.error ??
    stagesResult.error ??
    stopsResult.error ??
    linksResult.error

  if (error !== null) {
    throw new JourneyRepositoryError(error.message, 'FETCH_FAILED')
  }

  if (journeyResult.data === null) {
    throw new JourneyRepositoryError('Journey not found.', 'NOT_FOUND')
  }

  const entryIds = (linksResult.data ?? []).map((link) => String(link.entry_id))
  const entriesResult =
    entryIds.length === 0
      ? { data: [], error: null }
      : await client
          .from('entries')
          .select('id, title, body, type, event_at, created_at, slug')
          .in('id', entryIds)
          .order('event_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })

  if (entriesResult.error !== null) {
    throw new JourneyRepositoryError(
      entriesResult.error.message,
      'FETCH_FAILED',
    )
  }

  const linksByEntryId = new Map(
    (linksResult.data ?? []).map((link) => [link.entry_id, link]),
  )

  const header = parseJourneyHeaderFromRemoteRecord(journeyResult.data)
  const spaceId =
    typeof journeyResult.data.space_id === 'string'
      ? journeyResult.data.space_id
      : ''

  return {
    ...header,
    entries: entriesResult.data.map((row) =>
      mapEntry(
        row as Record<string, unknown>,
        linksByEntryId.get(String(row.id)),
      ),
    ),
    spaceId,
    stages: (stagesResult.data ?? []).map((row) => mapStage(row)),
    stops: (stopsResult.data ?? []).map((row) => ({
      id: String(row.id),
      mapLatitude:
        typeof row.map_latitude === 'number' ? row.map_latitude : null,
      mapLongitude:
        typeof row.map_longitude === 'number' ? row.map_longitude : null,
      notes: typeof row.notes === 'string' ? row.notes : '',
      position:
        typeof row.position === 'number' ? Math.trunc(row.position) : undefined,
      stageId: typeof row.stage_id === 'string' ? row.stage_id : null,
      status: row.status === 'planned' ? 'planned' : 'visited',
      title: typeof row.title === 'string' ? row.title : '',
    })),
  }
}
