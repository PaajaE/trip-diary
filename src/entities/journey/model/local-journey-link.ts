import { z } from 'zod'

export const localJourneyLinkSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  entryId: z.uuid(),
  journeyId: z.uuid(),
  stageId: z.uuid().nullable(),
  stopId: z.uuid().nullable(),
})

export type LocalJourneyLink = z.infer<typeof localJourneyLinkSchema>
