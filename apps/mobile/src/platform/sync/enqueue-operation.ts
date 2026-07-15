import {
  enqueueSyncOperation,
  type SyncOperation,
} from '@/platform/sync/queue'
import { requestSyncDrain } from '@/foundation/sync/sync-drain-request'

const ENQUEUED_BY_USER_ID_KEY = 'enqueuedByUserId'

export async function enqueueSyncOperationForApp(input: {
  id: string
  operationType: string
  payload: Record<string, unknown>
  userId?: string | null
}): Promise<SyncOperation> {
  const payload =
    input.userId !== undefined && input.userId !== null
      ? {
          ...input.payload,
          [ENQUEUED_BY_USER_ID_KEY]: input.userId,
        }
      : input.payload

  const operation = await enqueueSyncOperation({
    id: input.id,
    operationType: input.operationType,
    payload,
  })

  requestSyncDrain('enqueue')
  return operation
}

export { ENQUEUED_BY_USER_ID_KEY }
