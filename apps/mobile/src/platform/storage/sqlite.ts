import { getMobileDatabase } from '@/platform/storage/database'
import {
  safeParseJourneyHeaderPayload,
  serializeJourneyHeaderToLegacyCachePayload,
  type JourneyHeader,
} from '@trip-diary/core/journey'

export type CachedJourney = JourneyHeader

export async function cacheJourney(journey: JourneyHeader): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `INSERT INTO journey_cache (id, payload, cached_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       payload = excluded.payload,
       cached_at = excluded.cached_at`,
    journey.id,
    JSON.stringify(serializeJourneyHeaderToLegacyCachePayload(journey)),
    new Date().toISOString(),
  )
}

export async function getCachedJourney(
  journeyId: string,
): Promise<JourneyHeader | null> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM journey_cache WHERE id = ?',
    journeyId,
  )

  if (row === null) {
    return null
  }

  try {
    return safeParseJourneyHeaderPayload(JSON.parse(row.payload) as unknown)
  } catch {
    return null
  }
}

export async function clearJourneyCache(journeyId: string): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync('DELETE FROM journey_cache WHERE id = ?', journeyId)
}
