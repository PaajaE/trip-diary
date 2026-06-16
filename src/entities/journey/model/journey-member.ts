import { z } from 'zod'

export const journeyMemberRoleSchema = z.enum(['owner', 'editor', 'member'])

export const journeyMemberSchema = z.object({
  avatarUrl: z.url().nullable(),
  displayName: z.string().nullable(),
  joinedAt: z.iso.datetime({ offset: true }),
  role: journeyMemberRoleSchema,
  userId: z.uuid(),
  username: z.string().nullable(),
})

export const journeyPendingInviteSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  email: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  role: z.enum(['editor', 'member']),
})

export const addJourneyMemberSchema = z.object({
  journeyId: z.uuid(),
  role: z.enum(['editor', 'member']),
  username: z.string().trim().min(3).max(30),
})

export type JourneyMember = z.infer<typeof journeyMemberSchema>
export type JourneyPendingInvite = z.infer<typeof journeyPendingInviteSchema>
export type JourneyMemberRole = z.infer<typeof journeyMemberRoleSchema>
export type AddJourneyMemberInput = z.infer<typeof addJourneyMemberSchema>

export const journeyMemberRoleLabels: Record<JourneyMemberRole, string> = {
  editor: 'Editor',
  member: 'Člen',
  owner: 'Vlastník',
}
