import { z } from 'zod'
import { importSourceKindSchema } from '@/entities/media/model/upload-job'

/**
 * Local triage state of one library item before it is uploaded (import flow
 * "Vybrat → Probrat → Nahrát"). Decisions live on the device (Dexie) until the
 * upload starts; nothing here touches Supabase.
 *
 *   found      read from the library, undecided ("nalezená")
 *   kept       Ponechána, will be uploaded
 *   starred    Nejlepší, will be uploaded and starred afterwards
 *   dismissed  Pryč: remembered, never re-offered, restorable
 *   uploaded   the upload job finished (the item no longer needs attention)
 */
export const triageStatusSchema = z.enum([
  'found',
  'kept',
  'starred',
  'dismissed',
  'uploaded',
])
export type TriageStatus = z.infer<typeof triageStatusSchema>

export const triageItemSchema = z.object({
  /** ★ still has to be written to the uploaded media row. */
  bestPending: z.boolean().default(false),
  burstId: z.string().nullable().default(null),
  byteSize: z.number().nonnegative().nullable().default(null),
  /** Exact UTC instant (ISO 8601) or null. */
  capturedAt: z.string().nullable(),
  durationMs: z.number().nonnegative().nullable().default(null),
  /** The local preview was unavailable (original only in iCloud). */
  icloudOnly: z.boolean().default(false),
  id: z.string().min(1),
  journeyId: z.string().min(1),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  mediaType: z.enum(['photo', 'video']),
  ownerId: z.string().min(1),
  /** Place name when the source knows one (never invented). */
  place: z.string().nullable().default(null),
  /** Sortable id of the read that offered the item last. */
  selectionId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceKind: importSourceKindSchema,
  status: triageStatusSchema,
  updatedAt: z.string(),
})
export type TriageItem = z.infer<typeof triageItemSchema>

export function triageItemId(
  journeyId: string,
  sourceKind: string,
  sourceId: string,
): string {
  return `${journeyId}|${sourceKind}|${sourceId}`
}

/** Items that still need the author's attention or an upload. */
export function isOpenTriageStatus(status: TriageStatus): boolean {
  return status === 'found' || status === 'kept' || status === 'starred'
}
