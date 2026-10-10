import { z } from 'zod'

export const uploadJobStateSchema = z.enum([
  'pending',
  'processing',
  'done',
  'skipped',
  'failed',
  'paused',
])
export type UploadJobState = z.infer<typeof uploadJobStateSchema>

export const UPLOAD_JOB_STATES = uploadJobStateSchema.options

export const importSourceKindSchema = z.enum(['web-files', 'photokit'])
export type ImportSourceKind = z.infer<typeof importSourceKindSchema>

/** A persisted import job (Dexie `uploadJobs`). One job per source item. */
export const uploadJobSchema = z.object({
  attempts: z.number().int().nonnegative(),
  byteSize: z.number().nonnegative().nullable().default(null),
  /** PhotoKit creationDate (exact UTC instant) or null. */
  capturedAt: z.string().nullable(),
  createdAt: z.string(),
  durationMs: z.number().nonnegative().nullable().default(null),
  id: z.string().min(1),
  journeyId: z.string().min(1),
  /** Error / skip reason code (see import-errors). */
  lastError: z.string().optional(),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  mediaId: z.string().optional(),
  mediaType: z.enum(['photo', 'video']),
  ownerId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceKind: importSourceKindSchema,
  state: uploadJobStateSchema,
  updatedAt: z.string(),
})
export type UploadJob = z.infer<typeof uploadJobSchema>

export function uploadJobId(
  journeyId: string,
  sourceKind: ImportSourceKind,
  sourceId: string,
): string {
  return `${journeyId}|${sourceKind}|${sourceId}`
}

/** "Everything since the last import" cursor per journey + source. */
export interface ImportCursor {
  journeyId: string
  key: string
  /** Newest captured_at (UTC instant) among done jobs. */
  lastCapturedAt: string
  sourceKind: ImportSourceKind
  updatedAt: string
}

export function importCursorKey(
  journeyId: string,
  sourceKind: ImportSourceKind,
): string {
  return `${journeyId}|${sourceKind}`
}
