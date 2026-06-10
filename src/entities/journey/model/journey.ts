import { z } from 'zod'

const optionalDateSchema = z.iso.date().nullable()

export const createJourneySchema = z
  .object({
    endsAt: optionalDateSchema,
    startsAt: optionalDateSchema,
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

export const journeyStopSchema = z.object({
  id: z.uuid(),
  notes: z.string(),
  stageId: z.uuid().nullable(),
  status: z.enum(['planned', 'visited']),
  title: z.string(),
})

export const journeyGuideSectionSchema = z.object({
  body: z.string(),
  id: z.uuid(),
  title: z.string(),
})

export const journeyDetailSchema = z.object({
  endsAt: optionalDateSchema,
  guides: z.array(journeyGuideSectionSchema),
  id: z.uuid(),
  stages: z.array(journeyStageSchema),
  startsAt: optionalDateSchema,
  status: z.enum(['planning', 'active', 'completed']),
  stops: z.array(journeyStopSchema),
  summary: z.string(),
  title: z.string(),
})

export type JourneyDetail = z.infer<typeof journeyDetailSchema>
