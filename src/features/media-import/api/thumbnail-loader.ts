import type { TriageSource } from '@/features/media-import/api/triage-source'

export type ThumbnailState =
  | { status: 'cloud' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { src: string; status: 'ready' }

export interface ThumbnailLoader {
  /** Queues previews for ids not requested before (batched, never twice). */
  request(ids: readonly string[]): void
  get(id: string): ThumbnailState
  subscribe(listener: () => void): () => void
  dispose(): void
}

const LOADING: ThumbnailState = { status: 'loading' }

/**
 * Batches thumbnail requests of the grid tiles (microtask-debounced), caches
 * the results and reports iCloud-only ids through `onCloud`. A failed batch
 * leaves its tiles as "missing" (a placeholder, not an error screen).
 */
export function createThumbnailLoader(
  source: Pick<TriageSource, 'thumbnails'>,
  options: {
    onCloud?: (ids: readonly string[]) => void
    size: number
  },
): ThumbnailLoader {
  const states = new Map<string, ThumbnailState>()
  const requested = new Set<string>()
  const listeners = new Set<() => void>()
  let queue: string[] = []
  let scheduled = false
  const life = { disposed: false }

  function emit(): void {
    for (const listener of listeners) listener()
  }

  async function flush(): Promise<void> {
    scheduled = false
    const ids = queue
    queue = []
    if (ids.length === 0 || life.disposed) return
    try {
      const results = await source.thumbnails(ids, options.size)
      if (life.disposed as boolean) return
      const cloud: string[] = []
      const seen = new Set<string>()
      for (const result of results) {
        seen.add(result.id)
        if (result.src !== null) {
          states.set(result.id, { src: result.src, status: 'ready' })
        } else if (result.cloud) {
          states.set(result.id, { status: 'cloud' })
          cloud.push(result.id)
        } else {
          states.set(result.id, { status: 'missing' })
        }
      }
      for (const id of ids) {
        if (!seen.has(id)) states.set(id, { status: 'missing' })
      }
      if (cloud.length > 0) options.onCloud?.(cloud)
    } catch {
      for (const id of ids) states.set(id, { status: 'missing' })
    }
    emit()
  }

  return {
    dispose() {
      life.disposed = true
      listeners.clear()
    },
    get(id) {
      return states.get(id) ?? LOADING
    },
    request(ids) {
      for (const id of ids) {
        if (requested.has(id)) continue
        requested.add(id)
        queue.push(id)
      }
      if (queue.length > 0 && !scheduled) {
        scheduled = true
        queueMicrotask(() => {
          void flush()
        })
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
