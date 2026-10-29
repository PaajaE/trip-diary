import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  browserStorage,
  loadReadingPosition,
  saveReadingPosition,
  type ReadingPosition,
} from '@/features/public-journey/lib/reading-position'
import { useScrollSpy } from '@/features/public-journey/lib/use-scroll-spy'

const SAVE_DELAY_MS = 800

function subscribe(): () => void {
  // The bookmark only changes on other pages; nothing to listen to here.
  return () => undefined
}

/**
 * Bookmark saved earlier in this browser. During prerender and hydration it is
 * null (server snapshot), so the markup matches for everybody; the saved value
 * appears right after.
 */
export function useSavedReadingPosition(key: string): ReadingPosition | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return browserStorage()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    () => null,
  )
  return useMemo(
    () =>
      raw === null ? null : loadReadingPosition({ getItem: () => raw }, key),
    [key, raw],
  )
}

/**
 * Remembers the day being read on a stage page. Debounced, so scrolling past
 * several days saves only where the reader settled.
 */
export function useRecordReadingPosition(
  key: string,
  stageId: string,
  dayIds: readonly string[],
): void {
  const [active] = useScrollSpy(dayIds)
  useEffect(() => {
    if (active === '') return undefined
    const timer = window.setTimeout(() => {
      saveReadingPosition(browserStorage(), key, { dayId: active, stageId })
    }, SAVE_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [active, key, stageId])
}
