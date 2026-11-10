import { knownSourceAssets } from '@/entities/media/api/media-found.repository'
import { listExistingSourceAssetIds } from '@/entities/media/api/media.repository'
import { dexieUploadJobStore } from '@/entities/media/api/upload-jobs.store'
import type { ImportSourceKind } from '@/entities/media/model/upload-job'
import { createImportProcessor } from '@/features/media-import/api/import-processor'
import {
  browserOnlineEvents,
  createUploadQueue,
  timeoutScheduler,
  type UploadQueue,
} from '@/features/media-import/api/upload-queue'
import type { MediaSource } from '@/features/media-import/model/types'
import { isBrowserOnline } from '@/shared/lib/network'

/** The app's queue: Dexie persistence, Supabase dedupe, browser online events. */
export function createImportQueue(
  journeyId: string,
  ownerId: string,
  sources: ReadonlyMap<ImportSourceKind, MediaSource>,
): UploadQueue {
  return createUploadQueue({
    clock: () => Date.now(),
    isOnline: isBrowserOnline,
    journeyId,
    listDismissed: async (journey, sourceIds) => {
      const known = await knownSourceAssets(journey, sourceIds)
      return new Set(
        known
          .filter((r) => r.state === 'dismissed')
          .map((r) => r.sourceAssetId),
      )
    },
    listExisting: listExistingSourceAssetIds,
    onOnline: browserOnlineEvents,
    ownerId,
    process: createImportProcessor({ getSource: (kind) => sources.get(kind) }),
    schedule: timeoutScheduler,
    store: dexieUploadJobStore,
  })
}
