import { getMobileDatabase } from '@/platform/storage/database'
import {
  safeParseJourneyStopPayload,
  type JourneyStop,
} from '@trip-diary/core/journey'

export interface CachedJourneyStopsSnapshot {
  cachedAt: string | null
  stops: JourneyStop[]
}

function parseCachedStopPayload(payload: unknown): JourneyStop | null {
  return safeParseJourneyStopPayload(payload)
}

export async function readCachedJourneyStops(
  userId: string,
  journeyId: string,
): Promise<CachedJourneyStopsSnapshot> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<{
    cached_at: string
    payload: string
  }>(
    `SELECT payload, cached_at
     FROM journey_stop_cache
     WHERE user_id = ? AND journey_id = ?`,
    userId,
    journeyId,
  )

  if (row === null) {
    return { cachedAt: null, stops: [] }
  }

  try {
    const payload = JSON.parse(row.payload) as unknown
    if (!Array.isArray(payload)) {
      return { cachedAt: row.cached_at, stops: [] }
    }

    const stops: JourneyStop[] = []
    for (const item of payload) {
      const parsed = parseCachedStopPayload(item)
      if (parsed !== null) {
        stops.push(parsed)
      }
    }

    return { cachedAt: row.cached_at, stops }
  } catch {
    return { cachedAt: row.cached_at, stops: [] }
  }
}

export async function replaceCachedJourneyStops(
  userId: string,
  journeyId: string,
  stops: JourneyStop[],
): Promise<void> {
  const db = await getMobileDatabase()
  const cachedAt = new Date().toISOString()

  await db.runAsync(
    `INSERT INTO journey_stop_cache (user_id, journey_id, payload, cached_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, journey_id) DO UPDATE SET
       payload = excluded.payload,
       cached_at = excluded.cached_at`,
    userId,
    journeyId,
    JSON.stringify(stops),
    cachedAt,
  )
}

export async function clearCachedJourneyStopsForJourney(
  userId: string,
  journeyId: string,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    'DELETE FROM journey_stop_cache WHERE user_id = ? AND journey_id = ?',
    userId,
    journeyId,
  )
}
