import { z } from 'zod'

/**
 * Where a reader stopped, kept only in this browser (no account, no server).
 * Read after mount, never during render, so prerendered HTML stays identical
 * for everybody.
 */
const readingPositionSchema = z.object({
  /** Element id of the day, e.g. `day-2026-06-11`. */
  dayId: z.string().min(1),
  stageId: z.string().min(1),
})

export type ReadingPosition = z.infer<typeof readingPositionSchema>

export function readingKey(spaceHandle: string, journeySlug: string): string {
  return `td.reading.${spaceHandle}/${journeySlug}`
}

export function loadReadingPosition(
  storage: Pick<Storage, 'getItem'> | null,
  key: string,
): ReadingPosition | null {
  try {
    const raw = storage?.getItem(key)
    if (raw === null || raw === undefined) return null
    const parsed = readingPositionSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    // Private mode, blocked storage, corrupt value: just no bookmark.
    return null
  }
}

export function saveReadingPosition(
  storage: Pick<Storage, 'setItem'> | null,
  key: string,
  position: ReadingPosition,
): void {
  try {
    storage?.setItem(key, JSON.stringify(position))
  } catch {
    // Quota or blocked storage: the bookmark is a convenience only.
  }
}

/** Storage that may be unavailable (SSR, prerender, blocked cookies). */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
