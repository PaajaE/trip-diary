import { z } from 'zod'
import { journeyListItemSchema } from '@/entities/journey/model/core-journey'

export const dashboardJourneyCardSchema = journeyListItemSchema.extend({
  role: z.enum(['owner', 'editor', 'member']),
  summary: z.string().max(5000),
  syncStatus: z.enum(['pending', 'syncing', 'failed']).optional(),
  visibility: z.enum(['public', 'private']),
})

export const dashboardDataSchema = z.object({
  journeys: z.array(dashboardJourneyCardSchema),
})

export const dashboardQuerySchema = z.object({
  journeyLimit: z.number().int().min(1).max(20).default(6),
  userId: z.uuid(),
})

export type DashboardData = z.infer<typeof dashboardDataSchema>
export type DashboardJourneyCard = z.infer<typeof dashboardJourneyCardSchema>
export type DashboardQueryInput = z.input<typeof dashboardQuerySchema>
