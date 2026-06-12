import { z } from 'zod'

export const localJourneyLinkSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  entryId: z.uuid(),
  journeyId: z.uuid(),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  locationTitle: z.string().max(160).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  stageId: z.uuid().nullable(),
  stopId: z.uuid().nullable(),
  syncOperationId: z.uuid().optional(),
})

export type LocalJourneyLink = z.infer<typeof localJourneyLinkSchema>
