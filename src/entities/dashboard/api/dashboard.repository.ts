import {
  dashboardDataSchema,
  dashboardQuerySchema,
  type DashboardData,
  type DashboardJourneyCard,
  type DashboardQueryInput,
} from '@/entities/dashboard/model/dashboard'
import { listPendingLocalJourneys } from '@/entities/journey/api/local-journey.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { isBrowserOnline } from '@/shared/lib/network'

export async function getDashboardData(
  input: DashboardQueryInput,
): Promise<DashboardData> {
  const query = dashboardQuerySchema.parse(input)
  const localJourneys = await listPendingLocalJourneys(query.userId)

  if (!isBrowserOnline()) {
    return dashboardDataSchema.parse({
      entries: [],
      journeys: localJourneys,
    })
  }

  try {
    const remote = await fetchDashboardFromRemote(query)
    return dashboardDataSchema.parse({
      entries: remote.entries,
      journeys: mergeDashboardJourneys(localJourneys, remote.journeys),
    })
  } catch {
    return dashboardDataSchema.parse({
      entries: [],
      journeys: localJourneys,
    })
  }
}

function mergeDashboardJourneys(
  localJourneys: DashboardJourneyCard[],
  remoteJourneys: DashboardJourneyCard[],
): DashboardJourneyCard[] {
  const remoteIds = new Set(remoteJourneys.map((journey) => journey.id))
  const pendingLocal = localJourneys.filter(
    (journey) => !remoteIds.has(journey.id),
  )

  return [...pendingLocal, ...remoteJourneys].sort((left, right) => {
    return (
      new Date(right.updatedAt).valueOf() - new Date(left.updatedAt).valueOf()
    )
  })
}

async function fetchDashboardFromRemote(
  query: ReturnType<typeof dashboardQuerySchema.parse>,
): Promise<DashboardData> {
  const client = getSupabaseClient()

  const [membershipsResult, entriesResult] = await Promise.all([
    client
      .from('journey_members')
      .select('journey_id, role')
      .eq('user_id', query.userId),
    client
      .from('entries')
      .select(
        'id, title, type, status, visibility, event_at, updated_at, published_at',
      )
      .eq('creator_id', query.userId)
      .order('updated_at', { ascending: false })
      .limit(query.entryLimit),
  ])

  const firstError = membershipsResult.error ?? entriesResult.error
  if (firstError !== null) {
    throw firstError
  }

  const memberships = membershipsResult.data ?? []
  const entries = entriesResult.data ?? []
  const journeyLinks =
    entries.length === 0
      ? []
      : await getJourneyLinks(entries.map((entry) => entry.id))
  const linkedEntryIds = new Set(journeyLinks.map((link) => link.entry_id))
  const rolesByJourneyId = new Map(
    memberships.map(({ journey_id, role }) => [journey_id, role]),
  )

  const journeys =
    memberships.length === 0
      ? []
      : await getRecentJourneys(
          memberships.map(({ journey_id }) => journey_id),
          query.journeyLimit,
        )

  return dashboardDataSchema.parse({
    entries: entries
      .filter((entry) => !linkedEntryIds.has(entry.id))
      .map((entry) => ({
        eventAt: entry.event_at,
        id: entry.id,
        publishedAt: entry.published_at,
        status: entry.status,
        title: entry.title,
        type: entry.type,
        updatedAt: entry.updated_at,
        visibility: entry.visibility,
      })),
    journeys: journeys.map((journey) => ({
      endsAt: journey.ends_at,
      id: journey.id,
      role: rolesByJourneyId.get(journey.id),
      startsAt: journey.starts_at,
      status: journey.status,
      summary: journey.summary,
      title: journey.title,
      updatedAt: journey.updated_at,
      visibility: journey.visibility,
    })),
  })
}

async function getJourneyLinks(entryIds: string[]) {
  const { data, error } = await getSupabaseClient()
    .from('entry_journey_links')
    .select('entry_id, journey_id')
    .in('entry_id', entryIds)

  if (error !== null) {
    throw error
  }

  return data
}

async function getRecentJourneys(journeyIds: string[], limit: number) {
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select(
      'id, title, summary, status, visibility, starts_at, ends_at, updated_at',
    )
    .in('id', journeyIds)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error !== null) {
    throw error
  }

  return data
}
