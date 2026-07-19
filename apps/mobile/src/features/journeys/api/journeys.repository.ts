import {
  clearCachedJourneyListForUser,
  readCachedJourneyList,
  replaceCachedJourneyList,
} from '@/platform/storage/journey-list-cache'
import { cacheJourney, type CachedJourney } from '@/platform/storage/sqlite'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import {
  assertCachedJourneyListItem,
  toJourneyListItem,
  type JourneyListItem,
} from '@/features/journeys/model/journey-list-item'
import {
  parseJourneyHeaderFromRemoteRecord,
  parseJourneyListItemFromRemoteRecord,
  type JourneyHeader,
} from '@trip-diary/core/journey'

export class JourneyRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_CONFIGURED' | 'FETCH_FAILED' | 'NOT_FOUND',
  ) {
    super(message)
    this.name = 'JourneyRepositoryError'
  }
}

export interface JourneyDetail {
  isOffline: boolean
  journey: JourneyHeader
}

export interface JourneyListLoadResult {
  cachedAt: string | null
  isAuthoritativeEmpty: boolean
  isFromCache: boolean
  isOffline: boolean
  journeys: JourneyListItem[]
  refreshFailed: boolean
  spaceId: string
}

export type { JourneyListItem } from '@/features/journeys/model/journey-list-item'

function mapRemoteListRow(row: Record<string, unknown>): JourneyListItem {
  return toJourneyListItem(parseJourneyListItemFromRemoteRecord(row))
}

export async function fetchJourneyListRemote(
  spaceId: string,
): Promise<JourneyListItem[]> {
  if (!isSupabaseConfigured()) {
    throw new JourneyRepositoryError(
      'Supabase is not configured.',
      'NOT_CONFIGURED',
    )
  }

  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('id, title, summary, starts_at, ends_at, status, updated_at')
    .eq('space_id', spaceId)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error !== null) {
    throw new JourneyRepositoryError(error.message, 'FETCH_FAILED')
  }

  if (!Array.isArray(data)) {
    throw new JourneyRepositoryError(
      'Journey list response was incomplete.',
      'FETCH_FAILED',
    )
  }

  return data.map((row) => mapRemoteListRow(row))
}

export async function loadJourneyList(input: {
  isOnline: boolean
  spaceId: string
  userId: string
}): Promise<JourneyListLoadResult> {
  const cached = await readCachedJourneyList(input.userId, input.spaceId)

  if (!isSupabaseConfigured()) {
    return {
      cachedAt: cached.cachedAt,
      isAuthoritativeEmpty: false,
      isFromCache: cached.journeys.length > 0,
      isOffline: true,
      journeys: cached.journeys,
      refreshFailed: false,
      spaceId: input.spaceId,
    }
  }

  if (!input.isOnline) {
    return {
      cachedAt: cached.cachedAt,
      isAuthoritativeEmpty: false,
      isFromCache: cached.journeys.length > 0,
      isOffline: true,
      journeys: cached.journeys,
      refreshFailed: false,
      spaceId: input.spaceId,
    }
  }

  try {
    const remote = await fetchJourneyListRemote(input.spaceId)
    await replaceCachedJourneyList(
      input.userId,
      input.spaceId,
      remote.map((journey) => assertCachedJourneyListItem(journey)),
    )

    return {
      cachedAt: new Date().toISOString(),
      isAuthoritativeEmpty: remote.length === 0,
      isFromCache: false,
      isOffline: false,
      journeys: remote,
      refreshFailed: false,
      spaceId: input.spaceId,
    }
  } catch (error) {
    if (cached.journeys.length > 0) {
      return {
        cachedAt: cached.cachedAt,
        isAuthoritativeEmpty: false,
        isFromCache: true,
        isOffline: false,
        journeys: cached.journeys,
        refreshFailed: true,
        spaceId: input.spaceId,
      }
    }

    throw error
  }
}

/** @deprecated Use fetchJourneyListRemote or loadJourneyList */
export async function fetchJourneyList(
  spaceId: string,
): Promise<JourneyListItem[]> {
  return fetchJourneyListRemote(spaceId)
}

export async function fetchJourneyDetail(
  journeyId: string,
  cached: CachedJourney | null,
): Promise<JourneyDetail> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseClient()
      .from('journeys')
      .select('id, title, summary, starts_at, ends_at, status')
      .eq('id', journeyId)
      .single()

    if (error === null) {
      const journey = parseJourneyHeaderFromRemoteRecord(data)
      await cacheJourney(journey)
      return { isOffline: false, journey }
    }
  }

  if (cached !== null) {
    return { isOffline: true, journey: cached }
  }

  throw new JourneyRepositoryError(
    'Journey is unavailable offline and could not be loaded.',
    'NOT_FOUND',
  )
}

export { clearCachedJourneyListForUser, readCachedJourneyList }
