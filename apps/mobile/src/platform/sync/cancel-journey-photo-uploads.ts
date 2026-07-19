import { PHOTO_UPLOAD_OPERATION } from '@/platform/sync/photo-upload'
import { getMobileDatabase } from '@/platform/storage/database'

/**
 * Drop queued photo uploads for a journey that was deleted remotely so the
 * drain loop cannot recreate orphaned photos after cascade delete.
 */
export async function cancelPendingPhotoUploadsForJourney(
  journeyId: string,
): Promise<number> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{
    id: string
    payload: string
    status: string
  }>(
    `SELECT id, payload, status
     FROM sync_queue
     WHERE operation_type = ?
       AND status IN ('pending', 'failed', 'processing')`,
    PHOTO_UPLOAD_OPERATION,
  )

  let cancelled = 0
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as { journeyId?: unknown }
      if (payload.journeyId !== journeyId) {
        continue
      }

      await db.runAsync('DELETE FROM sync_queue WHERE id = ?', row.id)
      cancelled += 1
    } catch {
      continue
    }
  }

  return cancelled
}
