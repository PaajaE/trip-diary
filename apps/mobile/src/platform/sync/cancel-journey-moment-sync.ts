import {
  ENTRY_CREATE_OPERATION,
  ENTRY_UPDATE_OPERATION,
} from '@/platform/sync/entry-sync'
import { getMobileDatabase } from '@/platform/storage/database'
import { listLocalMomentsForJourney } from '@/platform/storage/local-moments'

/**
 * Cancel pending Moment create/update ops and drop local moment rows for a
 * journey that was deleted.
 */
export async function cancelPendingMomentSyncForJourney(
  journeyId: string,
): Promise<number> {
  const db = await getMobileDatabase()
  const localMoments = await listLocalMomentsForJourney(journeyId)
  let cancelled = 0

  for (const moment of localMoments) {
    for (const operationId of [
      `entry-create-${moment.id}`,
      `entry-update-${moment.id}`,
    ]) {
      const result = await db.runAsync(
        `DELETE FROM sync_queue WHERE id = ? AND status IN ('pending', 'failed', 'processing')`,
        operationId,
      )
      cancelled += result.changes
    }
    await db.runAsync(`DELETE FROM local_moments WHERE id = ?`, moment.id)
  }

  // Also sweep any entry ops that still reference this journey in payload.
  const rows = await db.getAllAsync<{ id: string; payload: string }>(
    `SELECT id, payload FROM sync_queue
     WHERE operation_type IN (?, ?)
       AND status IN ('pending', 'failed', 'processing')`,
    ENTRY_CREATE_OPERATION,
    ENTRY_UPDATE_OPERATION,
  )

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as { journeyId?: unknown }
      if (payload.journeyId !== journeyId) {
        continue
      }
      await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, row.id)
      cancelled += 1
    } catch {
      continue
    }
  }

  return cancelled
}
