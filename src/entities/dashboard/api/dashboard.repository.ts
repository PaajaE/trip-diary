import {
  dashboardDataSchema,
  dashboardQuerySchema,
  type DashboardData,
  type DashboardEntryCard,
  type DashboardJourneyCard,
  type DashboardQueryInput,
} from '@/entities/dashboard/model/dashboard'
import {
  getDashboardCache,
  saveDashboardCache,
} from '@/entities/dashboard/api/local-dashboard-cache.repository'
import { prefetchJourneySnapshots } from '@/entities/dashboard/api/prefetch-journey-snapshots'
import type { JourneySnapshotRecord } from '@/entities/journey/api/local-journey-cache.repository'
import { listPendingLocalJourneys } from '@/entities/journey/api/local-journey.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { listDeletedRecordIds } from '@/shared/lib/local-deleted-records'
import { isBrowserOnline } from '@/shared/lib/network'

export async function getDashboardData(
  input: DashboardQueryInput,
): Promise<DashboardData> {
  const query = dashboardQuerySchema.parse(input)

  if (!isBrowserOnline()) {
    return buildOfflineDashboard(query)
  }

  try {
    const remote = await fetchDashboardFromRemote(query)
    const localJourneys = await listPendingLocalJourneys(query.userId)
    const data = dashboardDataSchema.parse({
      entries: remote.entries,
      journeys: mergeDashboardJourneys(localJourneys, remote.journeys),
    })
    await saveDashboardCache(query.userId, data)
    prefetchJourneySnapshots(data.journeys.map((journey) => journey.id))
    return data
  } catch {
    return buildOfflineDashboard(query)
  }
}

async function buildOfflineDashboard(
  query: ReturnType<typeof dashboardQuerySchema.parse>,
): Promise<DashboardData> {
  const [journeys, entries] = await Promise.all([
    listOfflineJourneyCards(query.userId, query.journeyLimit),
    listOfflineEntries(query.userId, query.entryLimit),
  ])

  return dashboardDataSchema.parse({ entries, journeys })
}

async function listOfflineJourneyCards(
  userId: string,
  journeyLimit: number,
): Promise<DashboardJourneyCard[]> {
  const [pendingLocal, cachedDashboard, snapshots, linkedJourneyIds] =
    await Promise.all([
      listPendingLocalJourneys(userId),
      getDashboardCache(userId),
      localDb.journeySnapshots.toArray(),
      listLinkedJourneyIdsForUser(userId),
    ])

  const cardsById = new Map<string, DashboardJourneyCard>()
  for (const journey of pendingLocal) {
    cardsById.set(journey.id, journey)
  }

  for (const journey of cachedDashboard?.journeys ?? []) {
    if (!cardsById.has(journey.id)) {
      cardsById.set(journey.id, journey)
    }
  }

  const snapshotById = new Map(
    snapshots.map((snapshot) => [snapshot.journeyId, snapshot]),
  )
  const deletedJourneyIds = await listDeletedRecordIds('journey', [
    ...cardsById.keys(),
    ...linkedJourneyIds,
    ...(cachedDashboard?.journeys.map((journey) => journey.id) ?? []),
  ])

  for (const journeyId of linkedJourneyIds) {
    if (cardsById.has(journeyId)) {
      continue
    }
    const snapshot = snapshotById.get(journeyId)
    if (snapshot !== undefined) {
      cardsById.set(journeyId, snapshotToJourneyCard(snapshot))
    }
  }

  return [...cardsById.values()]
    .filter((journey) => !deletedJourneyIds.has(journey.id))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).valueOf() - new Date(left.updatedAt).valueOf(),
    )
    .slice(0, journeyLimit)
}

async function listLinkedJourneyIdsForUser(userId: string): Promise<string[]> {
  const links = await localDb.journeyLinks
    .where('creatorId')
    .equals(userId)
    .toArray()

  return [...new Set(links.map((link) => link.journeyId))]
}

function snapshotToJourneyCard(
  snapshot: JourneySnapshotRecord,
): DashboardJourneyCard {
  return {
    endsAt: snapshot.journey.endsAt,
    id: snapshot.journeyId,
    role: 'member',
    startsAt: snapshot.journey.startsAt,
    status: snapshot.journey.status,
    summary: snapshot.journey.summary,
    title: snapshot.journey.title,
    updatedAt: snapshot.cachedAt,
    visibility: 'public',
  }
}

async function listOfflineEntries(
  userId: string,
  entryLimit: number,
): Promise<DashboardEntryCard[]> {
  const [cachedDashboard, localStandalone] = await Promise.all([
    getDashboardCache(userId),
    listLocalStandaloneEntries(userId),
  ])

  const entriesById = new Map<string, DashboardEntryCard>()
  for (const entry of cachedDashboard?.entries ?? []) {
    entriesById.set(entry.id, entry)
  }

  for (const entry of localStandalone) {
    const existing = entriesById.get(entry.id)
    if (
      existing === undefined ||
      new Date(entry.updatedAt).valueOf() >
        new Date(existing.updatedAt).valueOf()
    ) {
      entriesById.set(entry.id, entry)
    }
  }

  const deletedEntryIds = await listDeletedRecordIds('entry', [
    ...entriesById.keys(),
  ])

  return [...entriesById.values()]
    .filter((entry) => !deletedEntryIds.has(entry.id))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).valueOf() - new Date(left.updatedAt).valueOf(),
    )
    .slice(0, entryLimit)
}

async function listLocalStandaloneEntries(
  userId: string,
): Promise<DashboardEntryCard[]> {
  const [entries, links] = await Promise.all([
    localDb.entries.where('creatorId').equals(userId).toArray(),
    localDb.journeyLinks.toArray(),
  ])
  const linkedEntryIds = new Set(links.map((link) => link.entryId))

  return entries
    .filter((entry) => !linkedEntryIds.has(entry.id))
    .map((entry) => ({
      eventAt: entry.eventAt,
      id: entry.id,
      publishedAt: entry.publishedAt,
      status: entry.status,
      title: entry.title,
      type: entry.type,
      updatedAt: entry.updatedAt,
      visibility: entry.visibility,
    }))
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
