import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react'
import type {
  ThumbnailLoader,
  ThumbnailState,
} from '@/features/media-import/api/thumbnail-loader'

export interface ThumbnailLoaders {
  /** ~256 px previews for the grid. */
  grid: ThumbnailLoader
  /** ~1024 px previews for quick sort and series. */
  large: ThumbnailLoader
}

export const ThumbnailsContext = createContext<ThumbnailLoaders | null>(null)

export function useThumbnailLoaders(): ThumbnailLoaders {
  const loaders = useContext(ThumbnailsContext)
  if (loaders === null) throw new Error('ThumbnailsContext is missing')
  return loaders
}

/** Preview state of one item; requests it (once) when `enabled`. */
export function useThumbnail(
  loader: ThumbnailLoader,
  id: string,
  enabled: boolean,
): ThumbnailState {
  useEffect(() => {
    if (enabled) loader.request([id])
  }, [enabled, id, loader])
  return useSyncExternalStore(
    (listener) => loader.subscribe(listener),
    () => loader.get(id),
  )
}
