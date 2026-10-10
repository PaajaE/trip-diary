import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Applies `update` to cached list data and returns a rollback that restores
 * the exact previous snapshot. A missing cache entry is left untouched.
 */
export function optimisticUpdate<T>(
  queryClient: QueryClient,
  key: QueryKey,
  update: (current: T) => T,
): () => void {
  const previous = queryClient.getQueryData<T>(key)
  if (previous === undefined) return () => undefined
  queryClient.setQueryData<T>(key, update(previous))
  return () => {
    queryClient.setQueryData<T>(key, previous)
  }
}

/** Replaces the item with `id` by `{ ...item, ...patch }`. */
export function patchListItem<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item))
}
