import type { Database } from '@/shared/api/database.types'
import {
  type Moment,
  MomentError,
  type MomentErrorCode,
  type MomentPatch,
  momentSchema,
  newMomentSchema,
  type NewMoment,
} from '@/entities/moment/model/moment'
import { getSupabaseClient } from '@/shared/api/supabase'

type MomentRow = Database['public']['Tables']['moments']['Row']
type MomentUpdate = Database['public']['Tables']['moments']['Update']

function toMoment(row: MomentRow): Moment {
  const parsed = momentSchema.safeParse({
    body: row.body,
    coverMediaId: row.cover_media_id,
    createdAt: row.created_at,
    endsAt: row.ends_at,
    id: row.id,
    journeyId: row.journey_id,
    latitude: row.latitude,
    locked: row.locked,
    longitude: row.longitude,
    origin: row.origin,
    placeId: row.place_id,
    published: row.published,
    startsAt: row.starts_at,
    title: row.title,
    updatedAt: row.updated_at,
  })
  if (!parsed.success) {
    throw new MomentError('invalid_row', parsed.error.message, parsed.error)
  }
  return parsed.data
}

function toUpdate(patch: MomentPatch): MomentUpdate {
  const update: MomentUpdate = {}
  if (patch.body !== undefined) update.body = patch.body
  if (patch.coverMediaId !== undefined)
    update.cover_media_id = patch.coverMediaId
  if (patch.endsAt !== undefined) update.ends_at = patch.endsAt
  if (patch.latitude !== undefined) update.latitude = patch.latitude
  if (patch.locked !== undefined) update.locked = patch.locked
  if (patch.longitude !== undefined) update.longitude = patch.longitude
  if (patch.origin !== undefined) update.origin = patch.origin
  if (patch.placeId !== undefined) update.place_id = patch.placeId
  if (patch.published !== undefined) update.published = patch.published
  if (patch.startsAt !== undefined) update.starts_at = patch.startsAt
  if (patch.title !== undefined) update.title = patch.title
  return update
}

export async function listJourneyMoments(journeyId: string): Promise<Moment[]> {
  const { data, error } = await getSupabaseClient()
    .from('moments')
    .select('*')
    .eq('journey_id', journeyId)
    .order('starts_at', { ascending: true })
  if (error !== null) {
    throw new MomentError('list_failed', error.message, error)
  }
  return data.map(toMoment)
}

export async function updateMoment(
  momentId: string,
  patch: MomentPatch,
): Promise<Moment> {
  const update = toUpdate(patch)
  if (Object.keys(update).length === 0) {
    throw new MomentError('invalid_input', 'empty patch')
  }
  const { data, error } = await getSupabaseClient()
    .from('moments')
    .update(update)
    .eq('id', momentId)
    .select('*')
    .maybeSingle()
  if (error !== null) {
    throw new MomentError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new MomentError('not_found')
  }
  return toMoment(data)
}

function rpcErrorCode(code: string | undefined): MomentErrorCode {
  if (code === 'P0002') return 'not_found'
  if (code === '42501') return 'forbidden'
  if (code === '22023') return 'invalid_input'
  if (code === '23505') return 'conflict'
  return 'update_failed'
}

/**
 * Folds `sourceId` into `targetId` (atomic RPC): the target keeps its
 * title/body, the range becomes the union, media move, the source is deleted
 * and the result is locked. Returns the target id.
 */
export async function mergeMoments(
  targetId: string,
  sourceId: string,
): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('merge_moments', {
    p_source: sourceId,
    p_target: targetId,
  })
  if (error !== null) {
    throw new MomentError(rpcErrorCode(error.code), error.message, error)
  }
  return data
}

/**
 * Splits a moment at `at` (atomic RPC). Media captured at or after `at` move
 * to the new moment, whose id is generated here. Returns the new moment id.
 */
export async function splitMoment(
  momentId: string,
  at: string,
  newId: string = crypto.randomUUID(),
): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc('split_moment', {
    p_at: at,
    p_moment: momentId,
    p_new_id: newId,
  })
  if (error !== null) {
    throw new MomentError(rpcErrorCode(error.code), error.message, error)
  }
  return data
}

export async function deleteMoment(momentId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('moments')
    .delete()
    .eq('id', momentId)
  if (error !== null) {
    throw new MomentError('delete_failed', error.message, error)
  }
}

/**
 * Inserts many moments in one request (all or nothing). Defaults to
 * origin auto and unlocked, as automatic clustering produces them.
 */
export async function createMoments(inputs: NewMoment[]): Promise<void> {
  if (inputs.length === 0) return
  const rows = inputs.map((input) => {
    const parsed = newMomentSchema.safeParse(input)
    if (!parsed.success) {
      throw new MomentError('invalid_input', parsed.error.message, parsed.error)
    }
    return {
      created_by: input.createdBy,
      ends_at: input.endsAt,
      id: input.id,
      journey_id: input.journeyId,
      latitude: input.latitude,
      locked: input.locked ?? false,
      longitude: input.longitude,
      origin: input.origin ?? 'auto',
      starts_at: input.startsAt,
    }
  })
  const { error } = await getSupabaseClient().from('moments').insert(rows)
  if (error !== null) {
    throw new MomentError('create_failed', error.message, error)
  }
}

/**
 * Deletes automatic, unlocked moments by id. The filters are a guard: hand
 * edited moments are never removed even if the caller's data was stale.
 */
export async function deleteAutoMoments(momentIds: string[]): Promise<void> {
  if (momentIds.length === 0) return
  const { error } = await getSupabaseClient()
    .from('moments')
    .delete()
    .in('id', momentIds)
    .eq('origin', 'auto')
    .eq('locked', false)
  if (error !== null) {
    throw new MomentError('delete_failed', error.message, error)
  }
}
