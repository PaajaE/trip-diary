import {
  MEDIA_WITH_VARIANTS,
  toMediaItem,
} from '@/entities/media/api/media-library.repository'
import {
  MediaLibraryError,
  type MediaLibraryErrorCode,
  newMomentIdSchema,
  purgedIdsSchema,
  rpcCountSchema,
  type TrashedMediaItem,
  trashedMediaItemSchema,
} from '@/entities/media/model/media-library'
import { fetchAllPages } from '@/shared/api/fetch-all-pages'
import { getSupabaseClient } from '@/shared/api/supabase'

/** The RPCs accept at most 500 ids per call. */
export const MEDIA_RPC_BATCH = 500

function rpcErrorCode(code: string | undefined): MediaLibraryErrorCode {
  if (code === 'P0002') return 'not_found'
  if (code === '42501') return 'forbidden'
  if (code === '22023') return 'invalid_input'
  return 'update_failed'
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += MEDIA_RPC_BATCH) {
    out.push(items.slice(i, i + MEDIA_RPC_BATCH))
  }
  return out
}

function parseResult<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false; error: unknown }
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new MediaLibraryError(
      'invalid_response',
      'unexpected RPC result',
      parsed.error,
    )
  }
  return parsed.data
}

interface RpcOutcome {
  data: unknown
  error: { code?: string; message: string } | null
}

async function countRpc(
  mediaIds: readonly string[],
  call: (part: string[]) => PromiseLike<RpcOutcome>,
): Promise<number> {
  let total = 0
  for (const part of chunks(mediaIds)) {
    const { data, error } = await call(part)
    if (error !== null) {
      throw new MediaLibraryError(
        rpcErrorCode(error.code),
        error.message,
        error,
      )
    }
    total += parseResult(rpcCountSchema, data)
  }
  return total
}

/** Moves media to the trash (and clears covers that point at them). */
export function trashMedia(mediaIds: readonly string[]): Promise<number> {
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('trash_media', { p_media_ids: part }),
  )
}

/** Brings media back from the trash. */
export function restoreMedia(mediaIds: readonly string[]): Promise<number> {
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('restore_media', { p_media_ids: part }),
  )
}

/** Moves media into a moment of the same journey (for the sorting desk). */
export function moveMedia(
  mediaIds: readonly string[],
  targetMomentId: string,
): Promise<number> {
  // The RPC rejects a null target (22023); never send one.
  if (targetMomentId === '') {
    return Promise.reject(
      new MediaLibraryError('invalid_input', 'target moment is required'),
    )
  }
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('move_media', {
      p_media_ids: part,
      p_target_moment: targetMomentId,
    }),
  )
}

/**
 * Step 1 of a purge: marks trashed rows as claimed and returns exactly the ids
 * whose files the caller may now delete. Ids not returned (restored meanwhile,
 * not trashed) must be left alone. Uploader only (42501), idempotent.
 */
export async function claimMediaPurge(
  mediaIds: readonly string[],
): Promise<string[]> {
  const claimed: string[] = []
  for (const part of chunks(mediaIds)) {
    const { data, error } = await getSupabaseClient().rpc('claim_media_purge', {
      p_media_ids: part,
    })
    if (error !== null) {
      throw new MediaLibraryError(
        rpcErrorCode(error.code),
        error.message,
        error,
      )
    }
    claimed.push(...parseResult(purgedIdsSchema, data))
  }
  return claimed
}

/**
 * Step 3 of a purge: deletes trashed AND claimed rows (alone it deletes
 * nothing; the R2 objects must already be gone, see purgeTrashedMedia). Only
 * the uploader may purge (42501 otherwise).
 * Returns the ids that were removed.
 */
export async function purgeMediaRows(
  mediaIds: readonly string[],
): Promise<string[]> {
  const removed: string[] = []
  for (const part of chunks(mediaIds)) {
    const { data, error } = await getSupabaseClient().rpc('purge_media', {
      p_media_ids: part,
    })
    if (error !== null) {
      throw new MediaLibraryError(
        rpcErrorCode(error.code),
        error.message,
        error,
      )
    }
    removed.push(...parseResult(purgedIdsSchema, data))
  }
  return removed
}

/** Creates a moment from the given media (client-generated id); returns the id. */
export async function createMomentFromMedia(
  mediaIds: readonly string[],
  newId: string = crypto.randomUUID(),
): Promise<string> {
  if (mediaIds.length === 0) {
    throw new MediaLibraryError('invalid_input', 'no media given')
  }
  if (mediaIds.length > MEDIA_RPC_BATCH) {
    throw new MediaLibraryError('invalid_input', 'too many media')
  }
  const { data, error } = await getSupabaseClient().rpc(
    'create_moment_from_media',
    { p_media_ids: [...mediaIds], p_new_id: newId },
  )
  if (error !== null) {
    throw new MediaLibraryError(rpcErrorCode(error.code), error.message, error)
  }
  return parseResult(newMomentIdSchema, data)
}

/** Lists a journey's trashed media, most recently trashed first. */
export async function listTrashedMedia(
  journeyId: string,
): Promise<TrashedMediaItem[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    getSupabaseClient()
      .from('media')
      .select(MEDIA_WITH_VARIANTS)
      .eq('journey_id', journeyId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (error !== null) {
    throw new MediaLibraryError('list_failed', error.message, error)
  }
  return data.map((row) => {
    const parsed = trashedMediaItemSchema.safeParse({
      ...toMediaItem(row),
      deletedAt: row.deleted_at,
      purgeClaimedAt: row.purge_claimed_at,
    })
    if (!parsed.success) {
      throw new MediaLibraryError(
        'invalid_row',
        parsed.error.message,
        parsed.error,
      )
    }
    return parsed.data
  })
}
