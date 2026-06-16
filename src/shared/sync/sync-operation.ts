import { z } from 'zod'

export const syncOperationSchema = z.discriminatedUnion('type', [
  z.object({
    createdAt: z.iso.datetime({ offset: true }),
    creatorId: z.uuid(),
    entryId: z.uuid(),
    id: z.uuid(),
    lastAttemptAt: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(['pending', 'syncing', 'failed']),
    type: z.literal('entry.create'),
  }),
  z.object({
    createdAt: z.iso.datetime({ offset: true }),
    creatorId: z.uuid(),
    id: z.uuid(),
    journeyId: z.uuid(),
    lastAttemptAt: z.iso.datetime({ offset: true }).optional(),
    status: z.enum(['pending', 'syncing', 'failed']),
    type: z.literal('journey.create'),
  }),
  z.object({
    createdAt: z.iso.datetime({ offset: true }),
    creatorId: z.uuid(),
    entryId: z.uuid(),
    id: z.uuid(),
    journeyId: z.uuid(),
    lastAttemptAt: z.iso.datetime({ offset: true }).optional(),
    latitude: z.number().min(-90).max(90).nullable(),
    locationTitle: z.string().max(160).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    stageId: z.uuid().nullable(),
    status: z.enum(['pending', 'syncing', 'failed']),
    stopId: z.uuid().nullable(),
    type: z.literal('journey.assignment.upsert'),
  }),
  z.object({
    createdAt: z.iso.datetime({ offset: true }),
    creatorId: z.uuid(),
    id: z.uuid(),
    lastAttemptAt: z.iso.datetime({ offset: true }).optional(),
    photoId: z.uuid(),
    status: z.enum(['pending', 'syncing', 'failed']),
    type: z.literal('photo.upload'),
  }),
])

export type SyncOperation = z.infer<typeof syncOperationSchema>
