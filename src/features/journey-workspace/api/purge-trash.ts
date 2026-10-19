import {
  claimMediaPurge,
  purgeMediaRows,
} from '@/entities/media/api/media-trash.repository'
import { deleteMediaObjectsRemote } from '@/entities/media/api/media-upload.api'

export interface PurgeDeps {
  claim: (mediaIds: string[]) => Promise<string[]>
  deleteObjects: (mediaId: string) => Promise<unknown>
  purgeRows: (mediaIds: string[]) => Promise<string[]>
}

export interface PurgeOutcome {
  /** R2 delete or the row purge failed: the item stays in the trash (claimed). */
  failed: string[]
  purged: string[]
  /** Not claimed (restored meanwhile, no longer trashed): left untouched. */
  skipped: string[]
}

const defaultDeps: PurgeDeps = {
  claim: claimMediaPurge,
  deleteObjects: deleteMediaObjectsRemote,
  purgeRows: purgeMediaRows,
}

/**
 * Permanently deletes trashed media in three steps: claim_media_purge (the
 * server decides which ids may go and blocks a concurrent restore), delete-media
 * on R2 only for the claimed ids, then purge_media for the ids whose objects
 * are gone. A failed R2 delete keeps the item in the trash; retrying is safe
 * because both claiming and delete-media are idempotent.
 */
export async function purgeTrashedMedia(
  mediaIds: readonly string[],
  deps: PurgeDeps = defaultDeps,
): Promise<PurgeOutcome> {
  let claimed: string[]
  try {
    claimed = await deps.claim([...mediaIds])
  } catch {
    return { failed: [...mediaIds], purged: [], skipped: [] }
  }
  const claimedSet = new Set(claimed)
  const skipped = mediaIds.filter((id) => !claimedSet.has(id))
  const gone: string[] = []
  const failed: string[] = []
  for (const id of claimed) {
    try {
      await deps.deleteObjects(id)
      gone.push(id)
    } catch {
      failed.push(id)
    }
  }
  if (gone.length === 0) return { failed, purged: [], skipped }
  try {
    const removed = new Set(await deps.purgeRows(gone))
    return {
      failed: [...failed, ...gone.filter((id) => !removed.has(id))],
      purged: gone.filter((id) => removed.has(id)),
      skipped,
    }
  } catch {
    return { failed: [...failed, ...gone], purged: [], skipped }
  }
}
