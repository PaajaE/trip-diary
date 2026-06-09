import { z } from 'zod'

export const syncOperationSchema = z.discriminatedUnion('type', [
  z.object({
    createdAt: z.iso.datetime({ offset: true }),
    creatorId: z.uuid(),
    entryId: z.uuid(),
    id: z.uuid(),
    status: z.enum(['pending', 'syncing', 'failed']),
    type: z.literal('entry.create'),
  }),
])

export type SyncOperation = z.infer<typeof syncOperationSchema>
