import { z } from 'zod'

const dateTimeSchema = z.iso.datetime({ offset: true })
const optionalDateSchema = z.iso.date().nullable()

export const dashboardJourneyCardSchema = z.object({
  endsAt: optionalDateSchema,
  id: z.uuid(),
  role: z.enum(['owner', 'editor', 'member']),
  startsAt: optionalDateSchema,
  status: z.enum(['planning', 'active', 'completed']),
  summary: z.string().max(5000),
  title: z.string().min(1).max(160),
  updatedAt: dateTimeSchema,
  visibility: z.enum(['public', 'private']),
})

export const dashboardEntryCardSchema = z.object({
  eventAt: dateTimeSchema.nullable(),
  id: z.uuid(),
  publishedAt: dateTimeSchema.nullable(),
  status: z.enum(['draft', 'published']),
  title: z.string().min(1).max(160).nullable(),
  type: z.enum(['story', 'tip', 'note', 'place']),
  updatedAt: dateTimeSchema,
  visibility: z.enum(['public', 'private']),
})

export const dashboardDataSchema = z.object({
  entries: z.array(dashboardEntryCardSchema),
  journeys: z.array(dashboardJourneyCardSchema),
})

export const dashboardQuerySchema = z.object({
  entryLimit: z.number().int().min(1).max(20).default(6),
  journeyLimit: z.number().int().min(1).max(20).default(6),
  userId: z.uuid(),
})

export type DashboardData = z.infer<typeof dashboardDataSchema>
export type DashboardEntryCard = z.infer<typeof dashboardEntryCardSchema>
export type DashboardJourneyCard = z.infer<typeof dashboardJourneyCardSchema>
export type DashboardQueryInput = z.input<typeof dashboardQuerySchema>
