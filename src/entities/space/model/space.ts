import { z } from 'zod'

export const spaceKindSchema = z.enum(['personal', 'family'])
export const spaceRoleSchema = z.enum(['owner', 'editor', 'member'])

export const spaceHandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9-]*$/)

export const spaceSummarySchema = z.object({
  avatarUrl: z.url().nullable(),
  description: z.string().max(500).nullable(),
  handle: spaceHandleSchema,
  id: z.uuid(),
  kind: spaceKindSchema,
  name: z.string().trim().min(1).max(80),
  role: spaceRoleSchema,
})

export const spaceMemberSchema = z.object({
  avatarUrl: z.url().nullable(),
  displayName: z.string().nullable(),
  joinedAt: z.iso.datetime({ offset: true }),
  role: spaceRoleSchema,
  userId: z.uuid(),
  username: z.string().nullable(),
})

export const createFamilySpaceSchema = z.object({
  handle: spaceHandleSchema,
  name: z.string().trim().min(1).max(80),
})

export const createSpaceInviteSchema = z.object({
  email: z.email(),
  role: z.enum(['editor', 'member']),
  spaceId: z.uuid(),
})

export const acceptSpaceInviteSchema = z.object({
  token: z.string().min(32).max(512),
})

export type AcceptSpaceInviteInput = z.infer<typeof acceptSpaceInviteSchema>
export type CreateFamilySpaceInput = z.infer<typeof createFamilySpaceSchema>
export type CreateSpaceInviteInput = z.infer<typeof createSpaceInviteSchema>
export type SpaceKind = z.infer<typeof spaceKindSchema>
export type SpaceMember = z.infer<typeof spaceMemberSchema>
export type SpaceRole = z.infer<typeof spaceRoleSchema>
export type SpaceSummary = z.infer<typeof spaceSummarySchema>
