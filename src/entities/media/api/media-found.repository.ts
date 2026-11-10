import type { Json } from '@/shared/api/database.types'
import {
  createFoundRowSchema,
  type CreateFoundResult,
  FOUND_RPC_BATCH,
  knownAssetRowSchema,
  type KnownSourceAsset,
  MediaFoundError,
  type MediaFoundErrorCode,
  type NewFoundMedia,
  newFoundMediaSchema,
  type PromoteItem,
  promoteItemSchema,
  promoteRowSchema,
  type PromoteResult,
  triageCountSchema,
  type TriageDecision,
  triageDecisionSchema,
} from '@/entities/media/model/media-found'
import { getSupabaseClient } from '@/shared/api/supabase'

/**
 * RPC layer for "found" media (metadata known, file not uploaded yet):
 * create_found_media, triage_found_media, promote_found_media and
 * known_source_assets. Chunks of 1000 (see the migration review); inputs and
 * results are validated with Zod. No UI. Contract:
 * supabase/migrations/20261031120100_v2_media_found.sql and
 * 20261110120000_v2_found_dismissed.sql.
 */

interface RpcError {
  code?: string
  message: string
}

function rpcErrorCode(code: string | undefined): MediaFoundErrorCode {
  if (code === 'P0002') return 'not_found'
  if (code === '42501') return 'forbidden'
  // 22023 invalid argument; 23514 check violation (a bad item fails its chunk).
  if (code === '22023' || code === '23514') return 'invalid_input'
  return 'rpc_failed'
}

function failRpc(error: RpcError): never {
  throw new MediaFoundError(rpcErrorCode(error.code), error.message, error)
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += FOUND_RPC_BATCH) {
    out.push(items.slice(i, i + FOUND_RPC_BATCH))
  }
  return out
}

function parseRows<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: unknown }
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new MediaFoundError(
      'invalid_response',
      'unexpected RPC result',
      parsed.error,
    )
  }
  return parsed.data
}

/** Parsed items are plain data (optional keys are absent, never undefined). */
function toJson(items: readonly object[]): Json {
  return JSON.parse(JSON.stringify(items)) as Json
}

function parseInput<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: unknown }
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new MediaFoundError('invalid_input', 'invalid item', parsed.error)
  }
  return parsed.data
}

/**
 * Creates found rows (idempotent per (owner, source asset): re-running
 * inserts nothing and reports 'existing'). The caller must be an editor of the
 * journey; rows are owned by the caller.
 */
export async function createFoundMedia(
  journeyId: string,
  items: readonly NewFoundMedia[],
): Promise<CreateFoundResult[]> {
  const valid = items.map((item) => parseInput(newFoundMediaSchema, item))
  const results: CreateFoundResult[] = []
  for (const part of chunks(valid)) {
    const { data, error } = await getSupabaseClient().rpc(
      'create_found_media',
      { p_items: toJson(part), p_journey_id: journeyId },
    )
    if (error !== null) failRpc(error)
    for (const row of parseRows(createFoundRowSchema.array(), data)) {
      results.push({
        assetId: row.asset_id,
        dropped: row.dropped ?? false,
        inJourneyId: row.in_journey_id,
        kept: row.kept ?? false,
        mediaId: row.media_id,
        outcome: row.outcome,
        status: row.current_status,
      })
    }
  }
  return results
}

/**
 * Applies one triage decision to found rows; resolves with the number of rows
 * that actually changed. All ids must be the caller's own rows of ONE journey
 * (the RPC rejects a mixed call whole), so chunk per journey.
 */
export async function triageFoundMedia(
  mediaIds: readonly string[],
  decision: TriageDecision,
): Promise<number> {
  parseInput(triageDecisionSchema, decision)
  let changed = 0
  for (const part of chunks(mediaIds)) {
    const { data, error } = await getSupabaseClient().rpc(
      'triage_found_media',
      { p_decision: decision, p_media_ids: part },
    )
    if (error !== null) failRpc(error)
    changed += parseRows(triageCountSchema, data)
  }
  return changed
}

/**
 * Moves kept found rows to 'pending' when their upload starts and records the
 * content hash. One result per distinct id: promoted | already_promoted
 * (idempotent re-run) | not_kept | duplicate (duplicateOf names the holder).
 */
export async function promoteFoundMedia(
  items: readonly PromoteItem[],
): Promise<PromoteResult[]> {
  const valid = items.map((item) => parseInput(promoteItemSchema, item))
  const results: PromoteResult[] = []
  for (const part of chunks(valid)) {
    const { data, error } = await getSupabaseClient().rpc(
      'promote_found_media',
      { p_items: toJson(part) },
    )
    if (error !== null) failRpc(error)
    for (const row of parseRows(promoteRowSchema.array(), data)) {
      results.push({
        duplicateOf: row.duplicate_of,
        mediaId: row.media_id,
        outcome: row.outcome,
      })
    }
  }
  return results
}

/**
 * Which of the caller's source assets are already known (found, kept,
 * dismissed or uploaded), whatever journey they are in. Unknown ids are absent.
 */
export async function knownSourceAssets(
  journeyId: string,
  sourceAssetIds: readonly string[],
): Promise<KnownSourceAsset[]> {
  const results: KnownSourceAsset[] = []
  for (const part of chunks(sourceAssetIds)) {
    const { data, error } = await getSupabaseClient().rpc(
      'known_source_assets',
      { p_journey_id: journeyId, p_source_asset_ids: part },
    )
    if (error !== null) failRpc(error)
    for (const row of parseRows(knownAssetRowSchema.array(), data)) {
      results.push({
        inJourneyId: row.in_journey_id,
        mediaId: row.media_id,
        sourceAssetId: row.source_asset_id,
        state: row.state,
      })
    }
  }
  return results
}
