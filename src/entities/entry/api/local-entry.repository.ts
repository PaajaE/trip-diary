import {
  createEntrySchema,
  entrySchema,
  type CreateEntryInput,
  type Entry,
} from '@/entities/entry/model/entry'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

export async function createLocalEntry(
  creatorId: string,
  input: CreateEntryInput,
): Promise<Entry> {
  const validInput = createEntrySchema.parse(input)
  const now = new Date().toISOString()
  const entry = entrySchema.parse({
    ...validInput,
    createdAt: now,
    creatorId,
    id: crypto.randomUUID(),
    publishedAt: null,
    status: 'draft',
    syncStatus: 'pending',
    updatedAt: now,
    version: 1,
  })
  const operation = syncOperationSchema.parse({
    createdAt: now,
    creatorId,
    entryId: entry.id,
    id: crypto.randomUUID(),
    status: 'pending',
    type: 'entry.create',
  })

  await localDb.transaction(
    'rw',
    localDb.entries,
    localDb.syncOperations,
    async () => {
      await localDb.entries.add(entry)
      await localDb.syncOperations.add(operation)
    },
  )

  return entry
}

export async function getLocalEntry(id: string): Promise<Entry | null> {
  const entry = await localDb.entries.get(id)
  return entry === undefined ? null : entrySchema.parse(entry)
}
