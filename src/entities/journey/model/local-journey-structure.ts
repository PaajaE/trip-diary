import { z } from 'zod'

export const localJourneyStageSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  id: z.uuid(),
  journeyId: z.uuid(),
  position: z.number().int().nonnegative(),
  summary: z.string().max(5000),
  syncStatus: z.enum(['pending', 'syncing', 'failed']),
  title: z.string().min(1).max(160),
  updatedAt: z.iso.datetime({ offset: true }),
})

export const localJourneyStopSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  id: z.uuid(),
  journeyId: z.uuid(),
  mapLatitude: z.number().min(-90).max(90).nullable(),
  mapLongitude: z.number().min(-180).max(180).nullable(),
  notes: z.string().max(10_000),
  position: z.number().int().nonnegative(),
  stageId: z.uuid().nullable(),
  status: z.enum(['planned', 'visited']),
  syncStatus: z.enum(['pending', 'syncing', 'failed']),
  title: z.string().min(1).max(160),
  updatedAt: z.iso.datetime({ offset: true }),
})

export const localJourneyGuideSchema = z.object({
  body: z.string().max(50_000),
  createdAt: z.iso.datetime({ offset: true }),
  creatorId: z.uuid(),
  id: z.uuid(),
  journeyId: z.uuid(),
  position: z.number().int().nonnegative(),
  syncStatus: z.enum(['pending', 'syncing', 'failed']),
  title: z.string().min(1).max(160),
  updatedAt: z.iso.datetime({ offset: true }),
})

export type LocalJourneyGuide = z.infer<typeof localJourneyGuideSchema>
export type LocalJourneyStage = z.infer<typeof localJourneyStageSchema>
export type LocalJourneyStop = z.infer<typeof localJourneyStopSchema>
