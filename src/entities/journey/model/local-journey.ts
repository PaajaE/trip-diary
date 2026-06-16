import { z } from 'zod'

const optionalDateSchema = z.iso.date().nullable()

export const localJourneySchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  endsAt: optionalDateSchema,
  id: z.uuid(),
  slug: z.string(),
  spaceId: z.uuid(),
  startsAt: optionalDateSchema,
  summary: z.string().max(5000),
  syncStatus: z.enum(['pending', 'syncing', 'failed', 'synced']),
  title: z.string().trim().min(1).max(160),
  updatedAt: z.iso.datetime({ offset: true }),
})

export type LocalJourney = z.infer<typeof localJourneySchema>
