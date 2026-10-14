import { z } from 'zod'

/**
 * v2 public engagement read model returned by the `get_public_engagement` RPC
 * (supabase/migrations/20261014120100_v2_guest_engagement.sql).
 * Hearts counts and approved comments for a whole public journey tree.
 * Mirrors the SQL json shape; keep both in sync.
 */

export const engagementTargetTypeSchema = z.enum(['journey', 'segment', 'moment', 'media'])

export const publicHeartCountSchema = z.object({
  count: z.number().int().positive(),
  targetId: z.uuid(),
  targetType: engagementTargetTypeSchema,
})

export const publicCommentSchema = z.object({
  body: z.string().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  name: z.string(),
  targetId: z.uuid(),
  targetType: engagementTargetTypeSchema,
})

export const publicEngagementSchema = z.object({
  comments: z.array(publicCommentSchema),
  hearts: z.array(publicHeartCountSchema),
})

export type EngagementTargetType = z.infer<typeof engagementTargetTypeSchema>
export type PublicHeartCount = z.infer<typeof publicHeartCountSchema>
export type PublicComment = z.infer<typeof publicCommentSchema>
export type PublicEngagement = z.infer<typeof publicEngagementSchema>

/** Parses the RPC result; `null` means the journey is missing or not public. */
export function parsePublicEngagement(payload: unknown): PublicEngagement | null {
  if (payload === null) {
    return null
  }
  return publicEngagementSchema.parse(payload)
}
