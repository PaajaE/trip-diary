import type { JourneyFullDetail } from '@/features/journeys/model/journey-detail'
import { getMobileDatabase } from '@/platform/storage/database'

export async function cacheJourneyContent(
  detail: JourneyFullDetail,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `INSERT INTO journey_content_cache (journey_id, payload, cached_at)
     VALUES (?, ?, ?)
     ON CONFLICT(journey_id) DO UPDATE SET
       payload = excluded.payload,
       cached_at = excluded.cached_at`,
    detail.id,
    JSON.stringify(detail),
    new Date().toISOString(),
  )
}

export async function getCachedJourneyContent(
  journeyId: string,
): Promise<JourneyFullDetail | null> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM journey_content_cache WHERE journey_id = ?`,
    journeyId,
  )
  if (row === null) {
    return null
  }

  try {
    return JSON.parse(row.payload) as JourneyFullDetail
  } catch {
    return null
  }
}

export async function clearCachedJourneyContent(
  journeyId: string,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    `DELETE FROM journey_content_cache WHERE journey_id = ?`,
    journeyId,
  )
}
