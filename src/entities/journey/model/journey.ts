import { z } from 'zod'
import { entrySyncStatusSchema } from '@/entities/entry/model/entry'
import {
  journeyStatusSchema,
  journeyStopSchema,
  optionalJourneyDateSchema,
} from '@/entities/journey/model/core-journey'

export {
  journeyStatusSchema,
  journeyStopSchema,
  journeyStopStatusSchema,
  optionalJourneyDateSchema,
  parseJourneyStopFromRemoteRecord,
  type JourneyStatus,
  type JourneyStop,
  type JourneyStopStatus,
} from '@/entities/journey/model/core-journey'

export const createJourneySchema = z
  .object({
    endsAt: optionalJourneyDateSchema,
    startsAt: optionalJourneyDateSchema,
    summary: z.string().max(5000),
    title: z.string().trim().min(1).max(160),
  })
  .refine(
    ({ endsAt, startsAt }) =>
      endsAt === null || startsAt === null || endsAt >= startsAt,
    { message: 'End date must not be before start date', path: ['endsAt'] },
  )

export type CreateJourneyInput = z.infer<typeof createJourneySchema>

export const journeyStageSchema = z.object({
  id: z.uuid(),
  summary: z.string(),
  title: z.string(),
})

export type JourneyStage = z.infer<typeof journeyStageSchema>

export const journeyGuideSectionSchema = z.object({
  body: z.string(),
  id: z.uuid(),
  title: z.string(),
})

export const journeyEntrySchema = z.object({
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }).nullable().optional(),
  eventAt: z.iso.datetime({ offset: true }).nullable(),
  id: z.uuid(),
  slug: z.string().nullable(),
  stageId: z.uuid().nullable(),
  stopId: z.uuid().nullable(),
  syncStatus: entrySyncStatusSchema.optional(),
  title: z.string().nullable(),
  type: z.enum(['story', 'tip', 'note', 'place']),
})

export const journeyDetailSchema = z.object({
  entries: z.array(journeyEntrySchema),
  endsAt: optionalJourneyDateSchema,
  guides: z.array(journeyGuideSectionSchema),
  id: z.uuid(),
  stages: z.array(journeyStageSchema),
  startsAt: optionalJourneyDateSchema,
  status: journeyStatusSchema,
  stops: z.array(journeyStopSchema),
  spaceId: z.uuid(),
  summary: z.string(),
  title: z.string(),
})

export type JourneyDetail = z.infer<typeof journeyDetailSchema>
