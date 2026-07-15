import {
  clearCachedJourneyStopsForJourney,
  readCachedJourneyStops,
  replaceCachedJourneyStops,
} from '@/platform/storage/journey-stop-cache'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import { parseRemoteJourneyStopRows } from '@/features/journeys/lib/journey-map-stops'
import type { JourneyStop } from '@trip-diary/core/journey'

export class JourneyStopsRepositoryError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_CONFIGURED' | 'FETCH_FAILED',
  ) {
    super(message)
    this.name = 'JourneyStopsRepositoryError'
  }
}

export interface JourneyStopsLoadResult {
  cachedAt: string | null
  isAuthoritativeEmpty: boolean
  isFromCache: boolean
  isOffline: boolean
  refreshFailed: boolean
  stops: JourneyStop[]
}

export async function fetchJourneyStopsRemote(
  journeyId: string,
): Promise<JourneyStop[]> {
  if (!isSupabaseConfigured()) {
    throw new JourneyStopsRepositoryError(
      'Supabase is not configured.',
      'NOT_CONFIGURED',
    )
  }

  const { data, error } = await getSupabaseClient()
    .from('journey_stops')
    .select(
      'id, stage_id, title, notes, status, map_latitude, map_longitude, position',
    )
    .eq('journey_id', journeyId)
    .order('position')

  if (error !== null) {
    throw new JourneyStopsRepositoryError(error.message, 'FETCH_FAILED')
  }

  return parseRemoteJourneyStopRows(data)
}

export async function loadJourneyStops(input: {
  isOnline: boolean
  journeyId: string
  userId: string
}): Promise<JourneyStopsLoadResult> {
  const cached = await readCachedJourneyStops(input.userId, input.journeyId)

  if (!isSupabaseConfigured()) {
    return {
      cachedAt: cached.cachedAt,
      isAuthoritativeEmpty: cached.stops.length === 0,
      isFromCache: cached.stops.length > 0,
      isOffline: true,
      refreshFailed: false,
      stops: cached.stops,
    }
  }

  if (!input.isOnline) {
    return {
      cachedAt: cached.cachedAt,
      isAuthoritativeEmpty: false,
      isFromCache: cached.stops.length > 0,
      isOffline: true,
      refreshFailed: false,
      stops: cached.stops,
    }
  }

  try {
    const remote = await fetchJourneyStopsRemote(input.journeyId)
    await replaceCachedJourneyStops(input.userId, input.journeyId, remote)

    return {
      cachedAt: new Date().toISOString(),
      isAuthoritativeEmpty: remote.length === 0,
      isFromCache: false,
      isOffline: false,
      refreshFailed: false,
      stops: remote,
    }
  } catch (error) {
    if (cached.stops.length > 0) {
      return {
        cachedAt: cached.cachedAt,
        isAuthoritativeEmpty: false,
        isFromCache: true,
        isOffline: false,
        refreshFailed: true,
        stops: cached.stops,
      }
    }

    throw error
  }
}

export { clearCachedJourneyStopsForJourney, readCachedJourneyStops }
