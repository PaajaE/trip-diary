import { requestSyncDrain } from '@/foundation/sync/sync-drain-request'
import {
  enqueueFailedSyncOperation,
  enqueueSyncOperation,
  type SyncOperation,
} from '@/platform/sync/queue'

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

export async function enqueueFailedSyncOperationForApp(input: {
  id: string
  operationType: string
  payload: Record<string, unknown>
  retryable?: boolean
  userId?: string | null
}): Promise<SyncOperation> {
  const payload =
    input.userId !== undefined && input.userId !== null
      ? {
          ...input.payload,
          [ENQUEUED_BY_USER_ID_KEY]: input.userId,
        }
      : input.payload

  return enqueueFailedSyncOperation({
    id: input.id,
    operationType: input.operationType,
    payload,
    retryable: input.retryable,
  })
}

export { ENQUEUED_BY_USER_ID_KEY }
