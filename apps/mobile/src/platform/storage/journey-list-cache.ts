import { getMobileDatabase } from '@/platform/storage/database'
import {
  safeParseJourneyListItemPayload,
  serializeJourneyListItemToLegacyCachePayload,
  type JourneyListItem,
} from '@/features/journeys/model/journey-list-item'

export interface CachedJourneyListSnapshot {
  cachedAt: string | null
  journeys: JourneyListItem[]
}

export async function readCachedJourneyList(
  userId: string,
): Promise<CachedJourneyListSnapshot> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{
    cached_at: string
    journey_id: string
    payload: string
    sort_order: number
  }>(
    `SELECT journey_id, payload, sort_order, cached_at
     FROM journey_list_cache
     WHERE user_id = ?
     ORDER BY sort_order ASC`,
    userId,
  )

  const journeys: JourneyListItem[] = []
  let cachedAt: string | null = null

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as unknown
      const parsed = safeParseJourneyListItemPayload(payload)
      if (parsed === null) {
        continue
      }

      journeys.push(parsed)
      if (cachedAt === null || row.cached_at > cachedAt) {
        cachedAt = row.cached_at
      }
    } catch {
      continue
    }
  }

  return { cachedAt, journeys }
}

export async function replaceCachedJourneyList(
  userId: string,
  journeys: JourneyListItem[],
): Promise<void> {
  const db = await getMobileDatabase()
  const cachedAt = new Date().toISOString()

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM journey_list_cache WHERE user_id = ?',
      userId,
    )

    for (const [index, journey] of journeys.entries()) {
      await db.runAsync(
        `INSERT INTO journey_list_cache (
           user_id, journey_id, payload, sort_order, cached_at
         ) VALUES (?, ?, ?, ?, ?)`,
        userId,
        journey.id,
        JSON.stringify(serializeJourneyListItemToLegacyCachePayload(journey)),
        index,
        cachedAt,
      )
    }
  })
}

export async function clearCachedJourneyListForUser(
  userId: string,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync('DELETE FROM journey_list_cache WHERE user_id = ?', userId)
}
