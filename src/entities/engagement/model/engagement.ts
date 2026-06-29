import { z } from 'zod'

export const contentTargetTypeSchema = z.enum(['journey', 'entry', 'photo'])
export type ContentTargetType = z.infer<typeof contentTargetTypeSchema>

export interface ContentTarget {
  id: string
  type: ContentTargetType
}

export const contentCommentSchema = z.object({
  authorId: z.uuid(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  hiddenAt: z.string().nullable(),
  id: z.uuid(),
  isOwn: z.boolean(),
  updatedAt: z.string(),
})

export type ContentComment = z.infer<typeof contentCommentSchema>

export const engagementSummarySchema = z.object({
  canModerate: z.boolean(),
  comments: z.array(contentCommentSchema),
  heartCount: z.number().int().nonnegative(),
  viewerHasHearted: z.boolean(),
})

export type EngagementSummary = z.infer<typeof engagementSummarySchema>
