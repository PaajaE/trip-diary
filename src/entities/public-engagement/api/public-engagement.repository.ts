import {
  engagementTargetTypeSchema,
  parsePublicEngagement,
  type EngagementTargetType,
  type PublicEngagement,
} from '@trip-diary/core/public-engagement'
import { z } from 'zod'
import { getSupabaseClient } from '@/shared/api/supabase'

export interface EngagementTarget {
  id: string
  type: EngagementTargetType
}

export type EngagementErrorKind =
  | 'forbidden'
  | 'invalid'
  | 'rate_limited'
  | 'unknown'

/** Typed failure; the UI maps `kind` to a friendly message. */
export class EngagementError extends Error {
  readonly kind: EngagementErrorKind

  constructor(kind: EngagementErrorKind, cause?: unknown) {
    super(`engagement:${kind}`, { cause })
    this.name = 'EngagementError'
    this.kind = kind
  }
}

/** DB rate limit raises 54000, length/name checks 23514, RLS/grants 42501. */
export function mapEngagementError(error: unknown): EngagementError {
  if (error instanceof EngagementError) return error
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined
  if (code === '54000') return new EngagementError('rate_limited', error)
  if (code === '23514' || code === '22023') {
    return new EngagementError('invalid', error)
  }
  if (code === '42501') return new EngagementError('forbidden', error)
  return new EngagementError('unknown', error)
}

function check(error: unknown): void {
  if (error !== null && error !== undefined) throw mapEngagementError(error)
}

export async function getPublicEngagement(
  spaceHandle: string,
  journeySlug: string,
): Promise<PublicEngagement | null> {
  const { data, error } = await getSupabaseClient().rpc(
    'get_public_engagement',
    { p_journey_slug: journeySlug, p_space_handle: spaceHandle },
  )
  check(error)
  return parsePublicEngagement(data)
}

export interface NewComment {
  body: string
  /** Required for guests; omit for registered users. */
  guestName?: string
  target: EngagementTarget
  userId: string
}

/**
 * Inserts exactly the granted columns. `id` and `status` are never sent (42501);
 * a trigger forces status (guests: pending).
 */
export async function addComment(comment: NewComment): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('content_comments')
    .insert({
      body: comment.body,
      target_id: comment.target.id,
      target_type: comment.target.type,
      user_id: comment.userId,
      ...(comment.guestName === undefined
        ? {}
        : { guest_name: comment.guestName }),
    })
  check(error)
}

export async function addHeart(
  target: EngagementTarget,
  userId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('content_hearts')
    .insert({ target_id: target.id, target_type: target.type, user_id: userId })
  // Already hearted (double tap, other tab): the end state is the same.
  if (error !== null && error.code === '23505') return
  check(error)
}

export async function removeHeart(
  target: EngagementTarget,
  userId: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('content_hearts')
    .delete()
    .eq('target_type', target.type)
    .eq('target_id', target.id)
    .eq('user_id', userId)
  check(error)
}

const targetRowSchema = z.object({
  target_id: z.uuid(),
  target_type: engagementTargetTypeSchema,
})

function inTargets(
  rows: EngagementTarget[],
  targets: EngagementTarget[] | undefined,
): EngagementTarget[] {
  if (targets === undefined) return rows
  const wanted = new Set(targets.map((t) => `${t.type}:${t.id}`))
  return rows.filter((row) => wanted.has(`${row.type}:${row.id}`))
}

/** Own hearts (own rows are selectable). Optionally narrowed to `targets`. */
export async function getMyHearts(
  userId: string,
  targets?: EngagementTarget[],
): Promise<EngagementTarget[]> {
  const { data, error } = await getSupabaseClient()
    .from('content_hearts')
    .select('target_type, target_id')
    .eq('user_id', userId)
    .limit(1000)
  check(error)
  const rows = z
    .array(targetRowSchema)
    // Rows for v1 target types (entry, photo) are not part of the v2 tree.
    .parse(
      (data ?? []).filter(
        (row) => engagementTargetTypeSchema.safeParse(row.target_type).success,
      ),
    )
    .map((row) => ({ id: row.target_id, type: row.target_type }))
  return inTargets(rows, targets)
}

export interface MyPendingComment {
  body: string
  createdAt: string
  guestName: string | null
  id: string
  target: EngagementTarget
}

const myPendingRowSchema = targetRowSchema.extend({
  body: z.string(),
  created_at: z.string(),
  guest_name: z.string().nullable(),
  id: z.uuid(),
})

export async function getMyPendingComments(
  userId: string,
  targets?: EngagementTarget[],
): Promise<MyPendingComment[]> {
  const { data, error } = await getSupabaseClient()
    .from('content_comments')
    .select('id, target_type, target_id, body, guest_name, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100)
  check(error)
  const all = z
    .array(myPendingRowSchema)
    .parse(
      (data ?? []).filter(
        (row) => engagementTargetTypeSchema.safeParse(row.target_type).success,
      ),
    )
    .map((row) => ({
      body: row.body,
      createdAt: row.created_at,
      guestName: row.guest_name,
      id: row.id,
      target: { id: row.target_id, type: row.target_type },
    }))
  if (targets === undefined) return all
  const kept = new Set(
    inTargets(
      all.map((c) => c.target),
      targets,
    ).map((t) => `${t.type}:${t.id}`),
  )
  return all.filter((c) => kept.has(`${c.target.type}:${c.target.id}`))
}

export interface PendingComment {
  body: string
  createdAt: string
  guestName: string
  id: string
  target: EngagementTarget
}

export async function listPendingComments(
  journeyId: string,
): Promise<PendingComment[]> {
  const { data, error } = await getSupabaseClient().rpc(
    'list_pending_comments',
    { p_journey_id: journeyId },
  )
  check(error)
  return z
    .array(myPendingRowSchema)
    .parse(data)
    .map((row) => ({
      body: row.body,
      createdAt: row.created_at,
      guestName: row.guest_name ?? '',
      id: row.id,
      target: { id: row.target_id, type: row.target_type },
    }))
}

export async function moderateComment(
  commentId: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const { error } = await getSupabaseClient().rpc('moderate_comment', {
    p_comment_id: commentId,
    p_status: status,
  })
  check(error)
}

const publicPathSchema = z.object({
  slug: z.string(),
  spaces: z.object({ handle: z.string() }),
  visibility: z.string(),
})

/** Public URL parts of a journey, or null when it is not public. */
export async function getJourneyPublicPath(
  journeyId: string,
): Promise<{ journeySlug: string; spaceHandle: string } | null> {
  const { data, error } = await getSupabaseClient()
    .from('journeys')
    .select('slug, visibility, spaces!journeys_space_id_fkey(handle)')
    .eq('id', journeyId)
    .maybeSingle()
  check(error)
  if (data === null) return null
  const row = publicPathSchema.parse(data)
  return row.visibility === 'public'
    ? { journeySlug: row.slug, spaceHandle: row.spaces.handle }
    : null
}
