import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'

export async function syncPendingOperations(): Promise<void> {
  const { data } = await getSupabaseClient().auth.getUser()
  const creatorId = data.user?.id

  if (creatorId === undefined) {
    return
  }

  const operations = await localDb.syncOperations
    .where('status')
    .anyOf(['pending', 'failed'])
    .filter((operation) => operation.creatorId === creatorId)
    .sortBy('createdAt')

  for (const operation of operations) {
    await localDb.syncOperations.update(operation.id, { status: 'syncing' })
    await localDb.entries.update(operation.entryId, { syncStatus: 'syncing' })

    try {
      const entry = await getLocalEntry(operation.entryId)
      if (entry === null) {
        await localDb.syncOperations.delete(operation.id)
        continue
      }

      const { error } = await getSupabaseClient().from('entries').upsert(
        {
          body: entry.body,
          creator_id: entry.creatorId,
          event_at: entry.eventAt,
          id: entry.id,
          language: entry.language,
          status: 'published',
          title: entry.title,
          type: entry.type,
          visibility: entry.visibility,
        },
        { ignoreDuplicates: true, onConflict: 'id' },
      )

      if (error !== null) {
        throw error
      }

      const { data: serverEntry, error: confirmationError } =
        await getSupabaseClient()
          .from('entries')
          .select('creator_id, published_at, status, updated_at, version')
          .eq('id', entry.id)
          .single()

      if (
        confirmationError !== null ||
        serverEntry.creator_id !== creatorId ||
        serverEntry.status !== 'published' ||
        serverEntry.published_at === null
      ) {
        throw new Error('Entry synchronization could not be confirmed')
      }

      await localDb.transaction(
        'rw',
        localDb.entries,
        localDb.syncOperations,
        async () => {
          await localDb.entries.update(entry.id, {
            publishedAt: serverEntry.published_at,
            status: 'published',
            syncStatus: 'synced',
            updatedAt: serverEntry.updated_at,
            version: serverEntry.version,
          })
          await localDb.syncOperations.delete(operation.id)
        },
      )
    } catch {
      await localDb.syncOperations.update(operation.id, { status: 'failed' })
      await localDb.entries.update(operation.entryId, { syncStatus: 'failed' })
      throw new Error('Entry synchronization failed')
    }
  }
}
