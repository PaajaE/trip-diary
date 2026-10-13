import { z } from 'zod'
import type { Database } from '@/shared/api/database.types'
import {
  type NewSegment,
  type Segment,
  SegmentError,
  type SegmentErrorCode,
  type SegmentPatch,
  segmentSchema,
} from '@/entities/segment/model/segment'
import { getSupabaseClient } from '@/shared/api/supabase'

type SegmentRow = Database['public']['Tables']['segments']['Row']
type SegmentUpdate = Database['public']['Tables']['segments']['Update']

function toSegment(row: SegmentRow): Segment {
  const parsed = segmentSchema.safeParse({
    body: row.body,
    coverMediaId: row.cover_media_id,
    createdAt: row.created_at,
    endsAt: row.ends_at,
    id: row.id,
    journeyId: row.journey_id,
    kind: row.kind,
    origin: row.origin,
    parentId: row.parent_id,
    position: row.position,
    startsAt: row.starts_at,
    title: row.title,
    tripType: row.trip_type,
    tz: row.tz,
    updatedAt: row.updated_at,
  })
  if (!parsed.success) {
    throw new SegmentError('invalid_row', parsed.error.message, parsed.error)
  }
  return parsed.data
}

/** Maps only defined patch fields so omitted keys never overwrite columns. */
function toUpdate(patch: SegmentPatch): SegmentUpdate {
  const update: SegmentUpdate = {}
  if (patch.body !== undefined) update.body = patch.body
  if (patch.coverMediaId !== undefined)
    update.cover_media_id = patch.coverMediaId
  if (patch.endsAt !== undefined) update.ends_at = patch.endsAt
  if (patch.kind !== undefined) update.kind = patch.kind
  if (patch.origin !== undefined) update.origin = patch.origin
  if (patch.parentId !== undefined) update.parent_id = patch.parentId
  if (patch.position !== undefined) update.position = patch.position
  if (patch.startsAt !== undefined) update.starts_at = patch.startsAt
  if (patch.title !== undefined) update.title = patch.title
  if (patch.tripType !== undefined) update.trip_type = patch.tripType
  if (patch.tz !== undefined) update.tz = patch.tz
  return update
}

const newSegmentShapeSchema = z
  .object({
    kind: z.enum(['stage', 'trip']),
    parentId: z.string().nullish(),
    title: z.string().min(1).max(160),
    tripType: z.string().nullish(),
  })
  .refine(
    (value) =>
      value.kind === 'stage'
        ? value.tripType == null && value.parentId == null
        : value.tripType != null,
    { message: 'stage has no trip type or parent; trip needs a trip type' },
  )

export async function listJourneySegments(
  journeyId: string,
): Promise<Segment[]> {
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .select('*')
    .eq('journey_id', journeyId)
    // Rejected suggestions keep their row but are never shown or used.
    .neq('origin', 'rejected')
    .order('starts_at', { ascending: true })
    .order('position', { ascending: true })
  if (error !== null) {
    throw new SegmentError('list_failed', error.message, error)
  }
  return data.map(toSegment)
}

/**
 * Like listJourneySegments but also returns rejected suggestions. Only the
 * automation needs them (to avoid suggesting the same thing again).
 */
export async function listJourneySegmentsIncludingRejected(
  journeyId: string,
): Promise<Segment[]> {
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .select('*')
    .eq('journey_id', journeyId)
    .order('starts_at', { ascending: true })
    .order('position', { ascending: true })
  if (error !== null) {
    throw new SegmentError('list_failed', error.message, error)
  }
  return data.map(toSegment)
}

function segmentInsertRow(input: NewSegment) {
  return {
    ends_at: input.endsAt,
    id: input.id,
    journey_id: input.journeyId,
    kind: input.kind,
    starts_at: input.startsAt,
    title: input.title,
    created_by: input.createdBy,
    ...(input.body === undefined ? {} : { body: input.body }),
    ...(input.coverMediaId === undefined
      ? {}
      : { cover_media_id: input.coverMediaId }),
    ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.parentId === undefined ? {} : { parent_id: input.parentId }),
    ...(input.position === undefined ? {} : { position: input.position }),
    ...(input.tripType === undefined ? {} : { trip_type: input.tripType }),
    ...(input.tz === undefined ? {} : { tz: input.tz }),
  }
}

/** Inserts many segments in one request (all or nothing). */
export async function createSegments(inputs: NewSegment[]): Promise<void> {
  if (inputs.length === 0) return
  for (const input of inputs) {
    const shape = newSegmentShapeSchema.safeParse(input)
    if (!shape.success) {
      throw new SegmentError('invalid_input', shape.error.message, shape.error)
    }
  }
  const { error } = await getSupabaseClient()
    .from('segments')
    .insert(inputs.map(segmentInsertRow))
  if (error !== null) {
    throw new SegmentError('create_failed', error.message, error)
  }
}

/** Deletes still-suggested segments by id; accepted/manual rows are never matched. */
export async function deleteSuggestedSegments(
  segmentIds: string[],
): Promise<void> {
  if (segmentIds.length === 0) return
  const { error } = await getSupabaseClient()
    .from('segments')
    .delete()
    .in('id', segmentIds)
    .eq('origin', 'suggested')
  if (error !== null) {
    throw new SegmentError('delete_failed', error.message, error)
  }
}

export async function createSegment(input: NewSegment): Promise<Segment> {
  const shape = newSegmentShapeSchema.safeParse(input)
  if (!shape.success) {
    throw new SegmentError('invalid_input', shape.error.message, shape.error)
  }
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .insert({
      ends_at: input.endsAt,
      id: input.id,
      journey_id: input.journeyId,
      kind: input.kind,
      starts_at: input.startsAt,
      title: input.title,
      created_by: input.createdBy,
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.coverMediaId === undefined
        ? {}
        : { cover_media_id: input.coverMediaId }),
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.parentId === undefined ? {} : { parent_id: input.parentId }),
      ...(input.position === undefined ? {} : { position: input.position }),
      ...(input.tripType === undefined ? {} : { trip_type: input.tripType }),
      ...(input.tz === undefined ? {} : { tz: input.tz }),
    })
    .select('*')
    .single()
  if (error !== null) {
    throw new SegmentError('create_failed', error.message, error)
  }
  return toSegment(data)
}

export async function updateSegment(
  segmentId: string,
  patch: SegmentPatch,
): Promise<Segment> {
  const update = toUpdate(patch)
  if (Object.keys(update).length === 0) {
    throw new SegmentError('invalid_input', 'empty patch')
  }
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .update(update)
    .eq('id', segmentId)
    .select('*')
    .maybeSingle()
  if (error !== null) {
    throw new SegmentError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new SegmentError('not_found')
  }
  return toSegment(data)
}

/** Confirms an automatically suggested segment (origin suggested -> accepted). */
export async function acceptSuggestedSegment(
  segmentId: string,
): Promise<Segment> {
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .update({ origin: 'accepted' })
    .eq('id', segmentId)
    .eq('origin', 'suggested')
    .select('*')
    .maybeSingle()
  if (error !== null) {
    throw new SegmentError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new SegmentError('not_found', 'no suggested segment with this id')
  }
  return toSegment(data)
}

/** Declines a suggested segment (origin suggested -> rejected); row is kept. */
export async function rejectSuggestedSegment(
  segmentId: string,
): Promise<Segment> {
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .update({ origin: 'rejected' })
    .eq('id', segmentId)
    .eq('origin', 'suggested')
    .select('*')
    .maybeSingle()
  if (error !== null) {
    throw new SegmentError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new SegmentError('not_found', 'no suggested segment with this id')
  }
  return toSegment(data)
}

/** Undo of accept/reject: puts an accepted or rejected segment back to suggested. */
export async function restoreSuggestedSegment(
  segmentId: string,
): Promise<Segment> {
  const { data, error } = await getSupabaseClient()
    .from('segments')
    .update({ origin: 'suggested' })
    .eq('id', segmentId)
    .in('origin', ['accepted', 'rejected'])
    .select('*')
    .maybeSingle()
  if (error !== null) {
    throw new SegmentError('update_failed', error.message, error)
  }
  if (data === null) {
    throw new SegmentError('not_found', 'no accepted or rejected segment')
  }
  return toSegment(data)
}

function boundaryErrorCode(code: string | undefined): SegmentErrorCode {
  if (code === 'P0002') return 'not_found'
  if (code === '42501') return 'forbidden'
  if (code === '22023') return 'invalid_input'
  return 'update_failed'
}

/**
 * Moves the shared edge of two adjacent same-kind segments (atomic RPC).
 * `at` is a UTC instant strictly inside both segments.
 */
export async function moveSegmentBoundary(
  beforeId: string,
  afterId: string,
  at: string,
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('move_segment_boundary', {
    p_after: afterId,
    p_at: at,
    p_before: beforeId,
  })
  if (error !== null) {
    throw new SegmentError(boundaryErrorCode(error.code), error.message, error)
  }
}

export async function deleteSegment(segmentId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('segments')
    .delete()
    .eq('id', segmentId)
  if (error !== null) {
    throw new SegmentError('delete_failed', error.message, error)
  }
}
