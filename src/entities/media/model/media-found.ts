import { z } from 'zod'
import { mediaStatusSchema } from '@/entities/media/model/media'

/** Rows per RPC call: 1000 everywhere (promote_found_media is superlinear). */
export const FOUND_RPC_BATCH = 1000

export type MediaFoundErrorCode =
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_response'
  | 'not_found'
  | 'rpc_failed'

/** Typed failure of the found-media RPC layer. */
export class MediaFoundError extends Error {
  readonly code: MediaFoundErrorCode

  constructor(code: MediaFoundErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'MediaFoundError'
    this.code = code
  }
}

const instantSchema = z.iso.datetime({ offset: true })

/** One item of create_found_media (camelCase keys, as the SQL reads them). */
export const newFoundMediaSchema = z.object({
  altitude: z.number().optional(),
  capturedAt: instantSchema.optional(),
  capturedAtSource: z.string().min(1).optional(),
  capturedTz: z.string().min(1).optional(),
  device: z.string().min(1).max(120).optional(),
  durationMs: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  id: z.uuid(),
  kind: z.enum(['photo', 'video']).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  locationSource: z.string().min(1).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /** 49-bit dHash (a safe JS integer). */
  phash: z.number().int().nonnegative().optional(),
  quality: z.record(z.string(), z.unknown()).optional(),
  /** 1..255 characters (the SQL check rejects the whole chunk otherwise). */
  sourceAssetId: z.string().min(1).max(255),
  width: z.number().int().positive().optional(),
})
export type NewFoundMedia = z.input<typeof newFoundMediaSchema>

export const foundOutcomeSchema = z.enum([
  'inserted',
  'existing',
  'id_conflict',
])

export const createFoundRowSchema = z.object({
  asset_id: z.string(),
  current_status: mediaStatusSchema.nullable(),
  dropped: z.boolean().nullable(),
  in_journey_id: z.uuid().nullable(),
  kept: z.boolean().nullable(),
  media_id: z.uuid().nullable(),
  outcome: foundOutcomeSchema,
})

export interface CreateFoundResult {
  assetId: string
  /** Row is in the Trash (dismissed before upload). */
  dropped: boolean
  inJourneyId: string | null
  /** reviewed_at is set. */
  kept: boolean
  mediaId: string | null
  outcome: z.infer<typeof foundOutcomeSchema>
  status: z.infer<typeof mediaStatusSchema> | null
}

export const triageDecisionSchema = z.enum([
  'keep',
  'star',
  'unstar',
  'dismiss',
  'drop',
  'restore',
  'undecided',
])
export type TriageDecision = z.infer<typeof triageDecisionSchema>

export const triageCountSchema = z.number().int().nonnegative()

export const promoteItemSchema = z.object({
  /** sha-256 hex; recorded by the RPC because content_hash has no UPDATE grant. */
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  id: z.uuid(),
})
export type PromoteItem = z.input<typeof promoteItemSchema>

export const promoteOutcomeSchema = z.enum([
  'promoted',
  'already_promoted',
  'not_kept',
  'duplicate',
])
export type PromoteOutcome = z.infer<typeof promoteOutcomeSchema>

export const promoteRowSchema = z.object({
  duplicate_of: z.uuid().nullable(),
  media_id: z.uuid(),
  outcome: promoteOutcomeSchema,
})

export interface PromoteResult {
  /** The row that already holds the content hash (outcome 'duplicate'). */
  duplicateOf: string | null
  mediaId: string
  outcome: PromoteOutcome
}

export const knownAssetStateSchema = z.enum([
  'found',
  'kept',
  'dismissed',
  'uploaded',
])
export type KnownAssetState = z.infer<typeof knownAssetStateSchema>

export const knownAssetRowSchema = z.object({
  in_journey_id: z.uuid().nullable(),
  media_id: z.uuid(),
  source_asset_id: z.string(),
  state: knownAssetStateSchema,
})

export interface KnownSourceAsset {
  inJourneyId: string | null
  mediaId: string
  sourceAssetId: string
  state: KnownAssetState
}
