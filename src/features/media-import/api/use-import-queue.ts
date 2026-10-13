import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ImportSourceKind } from '@/entities/media/model/upload-job'
import { createImportQueue } from '@/features/media-import/api/create-import-queue'
import type {
  QueueSnapshot,
  UploadQueue,
} from '@/features/media-import/api/upload-queue'
import type { MediaSource } from '@/features/media-import/model/types'

export interface ImportQueueHandle {
  queue: UploadQueue
  /** Registers the source whose items the worker may open. */
  setSource: (source: MediaSource) => void
  snapshot: QueueSnapshot
}

/** Creates (and loads) the persistent queue of one journey for one owner. */
export function useImportQueue(
  journeyId: string,
  ownerId: string,
): ImportQueueHandle {
  const [sources] = useState(() => new Map<ImportSourceKind, MediaSource>())
  const [queue] = useState(() => createImportQueue(journeyId, ownerId, sources))
  useEffect(() => {
    void queue.init()
    return () => {
      queue.dispose()
    }
  }, [queue])
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  const setSource = useCallback(
    (source: MediaSource) => {
      sources.set(source.kind, source)
    },
    [sources],
  )
  return { queue, setSource, snapshot }
}
