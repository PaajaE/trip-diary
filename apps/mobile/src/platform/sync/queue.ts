import { getMobileDatabase } from '@/platform/storage/database'
import {
  PHOTO_UPLOAD_OPERATION,
  PhotoUploadError,
  processPhotoUploadOperation,
} from './photo-upload'

/**
 * Five minutes — longer than expected mobile preview upload on slow networks,
 * short enough to recover quickly after an app kill during `processing`.
 */
export const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000

export type SyncOperationStatus = 'failed' | 'pending' | 'processing' | 'synced'

export interface SyncOperation {
  createdAt: string
  id: string
  operationType: string
  payload: Record<string, unknown>
  status: SyncOperationStatus
  statusUpdatedAt: string
}

export interface SyncProcessResult {
  operation: SyncOperation
  remoteStoragePath?: string
  status: SyncOperationStatus
}

let activeProcessingOperationId: string | null = null
let processingChain: Promise<unknown> = Promise.resolve()

function mapRow(row: {
  created_at: string
  id: string
  operation_type: string
  payload: string
  status: SyncOperationStatus
  status_updated_at: string
}): SyncOperation {
  return {
    createdAt: row.created_at,
    id: row.id,
    operationType: row.operation_type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status,
    statusUpdatedAt: row.status_updated_at,
  }
}

export async function recoverStaleProcessingOperations(
  thresholdMs: number = STALE_PROCESSING_THRESHOLD_MS,
  excludeOperationIds: string[] = [],
): Promise<number> {
  const db = await getMobileDatabase()
  const cutoff = new Date(Date.now() - thresholdMs).toISOString()

  if (excludeOperationIds.length === 0) {
    const result = await db.runAsync(
      `UPDATE sync_queue
       SET status = 'pending', status_updated_at = ?
       WHERE status = 'processing' AND status_updated_at < ?`,
      new Date().toISOString(),
      cutoff,
    )
    return result.changes
  }

  const placeholders = excludeOperationIds.map(() => '?').join(', ')
  const result = await db.runAsync(
    `UPDATE sync_queue
     SET status = 'pending', status_updated_at = ?
     WHERE status = 'processing'
       AND status_updated_at < ?
       AND id NOT IN (${placeholders})`,
    new Date().toISOString(),
    cutoff,
    ...excludeOperationIds,
  )
  return result.changes
}

export async function getSyncQueueCounts(): Promise<{
  failed: number
  pending: number
}> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{ count: number; status: SyncOperationStatus }>(
    `SELECT status, COUNT(*) AS count
     FROM sync_queue
     WHERE status IN ('pending', 'failed')
     GROUP BY status`,
  )

  let pending = 0
  let failed = 0

  for (const row of rows) {
    if (row.status === 'pending') {
      pending = row.count
    }
    if (row.status === 'failed') {
      failed = row.count
    }
  }

  return { failed, pending }
}

export interface SyncQueueStatusSummary {
  failed: number
  pending: number
  retryableFailed: number
  terminalFailed: number
}

function isTerminalFailurePayload(payload: Record<string, unknown>): boolean {
  return payload.retryable === false
}

export async function getSyncQueueStatusSummary(): Promise<SyncQueueStatusSummary> {
  const { failed, pending } = await getSyncQueueCounts()

  if (failed === 0) {
    return {
      failed,
      pending,
      retryableFailed: 0,
      terminalFailed: 0,
    }
  }

  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{ payload: string }>(
    `SELECT payload FROM sync_queue WHERE status = 'failed'`,
  )

  let retryableFailed = 0
  let terminalFailed = 0

  for (const row of rows) {
    const payload = JSON.parse(row.payload) as Record<string, unknown>
    if (isTerminalFailurePayload(payload)) {
      terminalFailed += 1
    } else {
      retryableFailed += 1
    }
  }

  return {
    failed,
    pending,
    retryableFailed,
    terminalFailed,
  }
}

export async function resetRetryableFailedOperations(): Promise<{
  resetCount: number
  terminalCount: number
}> {
  const db = await getMobileDatabase()
  const rows = await db.getAllAsync<{ id: string; payload: string }>(
    `SELECT id, payload FROM sync_queue WHERE status = 'failed'`,
  )
  const now = new Date().toISOString()
  let resetCount = 0
  let terminalCount = 0

  for (const row of rows) {
    const payload = JSON.parse(row.payload) as Record<string, unknown>

    if (isTerminalFailurePayload(payload)) {
      terminalCount += 1
      continue
    }

    await db.runAsync(
      `UPDATE sync_queue
       SET status = 'pending', status_updated_at = ?, payload = ?
       WHERE id = ?`,
      now,
      JSON.stringify({
        ...payload,
        lastError: null,
        retryable: null,
      }),
      row.id,
    )
    resetCount += 1
  }

  return { resetCount, terminalCount }
}

/**
 * Processes up to `maxOperations` pending queue entries sequentially.
 * Failed operations remain failed and are not retried in the same drain.
 */
export async function drainSyncQueue(
  maxOperations: number = 10,
): Promise<{ lastError: string | null; processedCount: number }> {
  let processedCount = 0
  let lastError: string | null = null

  while (processedCount < maxOperations) {
    const result = await processNextSyncOperation()
    if (result === null) {
      break
    }

    processedCount += 1

    if (result.status === 'failed') {
      lastError =
        typeof result.operation.payload.lastError === 'string'
          ? result.operation.payload.lastError
          : 'Sync operation failed.'
    }
  }

  return { lastError, processedCount }
}

export async function enqueueSyncOperation(input: {
  id: string
  operationType: string
  payload: Record<string, unknown>
}): Promise<SyncOperation> {
  const db = await getMobileDatabase()
  const createdAt = new Date().toISOString()

  await db.runAsync(
    `INSERT INTO sync_queue (
       id, operation_type, payload, status, created_at, status_updated_at
     ) VALUES (?, ?, ?, 'pending', ?, ?)`,
    input.id,
    input.operationType,
    JSON.stringify(input.payload),
    createdAt,
    createdAt,
  )

  return {
    createdAt,
    id: input.id,
    operationType: input.operationType,
    payload: input.payload,
    status: 'pending',
    statusUpdatedAt: createdAt,
  }
}

export async function peekNextSyncOperation(): Promise<SyncOperation | null> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<{
    created_at: string
    id: string
    operation_type: string
    payload: string
    status: SyncOperationStatus
    status_updated_at: string
  }>(
    `SELECT id, operation_type, payload, status, created_at, status_updated_at
     FROM sync_queue
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
  )

  return row === null ? null : mapRow(row)
}

export async function getSyncOperation(
  operationId: string,
): Promise<SyncOperation | null> {
  const db = await getMobileDatabase()
  const row = await db.getFirstAsync<{
    created_at: string
    id: string
    operation_type: string
    payload: string
    status: SyncOperationStatus
    status_updated_at: string
  }>(
    `SELECT id, operation_type, payload, status, created_at, status_updated_at
     FROM sync_queue
     WHERE id = ?`,
    operationId,
  )

  return row === null ? null : mapRow(row)
}

export async function markSyncOperationStatus(
  operationId: string,
  status: SyncOperationStatus,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    'UPDATE sync_queue SET status = ?, status_updated_at = ? WHERE id = ?',
    status,
    new Date().toISOString(),
    operationId,
  )
}

export async function updateSyncOperationPayload(
  operationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getMobileDatabase()
  await db.runAsync(
    'UPDATE sync_queue SET payload = ?, status_updated_at = ? WHERE id = ?',
    JSON.stringify(payload),
    new Date().toISOString(),
    operationId,
  )
}

async function markSyncOperationFailed(
  operation: SyncOperation,
  message: string,
  retryable: boolean,
): Promise<SyncOperation> {
  const payload = {
    ...operation.payload,
    lastError: message,
    retryable,
  }

  await updateSyncOperationPayload(operation.id, payload)
  await markSyncOperationStatus(operation.id, 'failed')

  return {
    ...operation,
    payload,
    status: 'failed',
    statusUpdatedAt: new Date().toISOString(),
  }
}

async function markSyncOperationSynced(
  operation: SyncOperation,
  payload: Record<string, unknown>,
): Promise<SyncOperation> {
  await updateSyncOperationPayload(operation.id, payload)
  await markSyncOperationStatus(operation.id, 'synced')

  return {
    ...operation,
    payload,
    status: 'synced',
    statusUpdatedAt: new Date().toISOString(),
  }
}

async function processNextSyncOperationUnsafe(): Promise<SyncProcessResult | null> {
  await recoverStaleProcessingOperations(
    STALE_PROCESSING_THRESHOLD_MS,
    activeProcessingOperationId === null
      ? []
      : [activeProcessingOperationId],
  )

  const next = await peekNextSyncOperation()
  if (next === null) {
    return null
  }

  activeProcessingOperationId = next.id
  await markSyncOperationStatus(next.id, 'processing')

  try {
    if (next.operationType === PHOTO_UPLOAD_OPERATION) {
      const uploadResult = await processPhotoUploadOperation(next.payload)
      const synced = await markSyncOperationSynced(next, {
        ...next.payload,
        lastError: null,
        remoteStoragePath: uploadResult.storagePath,
        retryable: null,
      })

      return {
        operation: synced,
        remoteStoragePath: uploadResult.storagePath,
        status: 'synced',
      }
    }

    if (next.operationType === 'journey.touch') {
      const synced = await markSyncOperationSynced(next, next.payload)
      return {
        operation: synced,
        status: 'synced',
      }
    }

    const failed = await markSyncOperationFailed(
      next,
      `Unsupported sync operation type: ${next.operationType}`,
      false,
    )

    return {
      operation: failed,
      status: 'failed',
    }
  } catch (error) {
    const { message, retryable } = normalizeSyncProcessingError(error)
    const failed = await markSyncOperationFailed(next, message, retryable)

    return {
      operation: failed,
      status: 'failed',
    }
  } finally {
    activeProcessingOperationId = null
  }
}

export async function processNextSyncOperation(): Promise<SyncProcessResult | null> {
  const run = processingChain.then(() => processNextSyncOperationUnsafe())
  processingChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** @deprecated Use processNextSyncOperation */
export async function processNextSyncOperationStub(): Promise<SyncOperation | null> {
  const result = await processNextSyncOperation()
  return result?.operation ?? null
}

function normalizeSyncProcessingError(error: unknown): {
  message: string
  retryable: boolean
} {
  if (error instanceof PhotoUploadError) {
    return {
      message: error.message,
      retryable: error.retryable,
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      retryable: true,
    }
  }

  return {
    message: 'Sync operation failed.',
    retryable: true,
  }
}
