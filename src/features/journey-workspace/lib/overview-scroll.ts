/**
 * Where the overview was when the user opened a day, so "back" lands in the
 * same place. Kept in memory for the page's lifetime; one entry per journey.
 */
interface Remembered {
  /** Day last viewed (it may have changed with the arrows on the day page). */
  dayKey: string | null
  scrollY: number
}

const remembered = new Map<string, Remembered>()

/** Called when leaving the overview for a day. */
export function rememberOverview(
  journeyId: string,
  scrollY: number,
  dayKey: string | null,
): void {
  remembered.set(journeyId, { dayKey, scrollY })
}

/** Called on the day page: the day to bring into view on return. */
export function rememberVisitedDay(journeyId: string, dayKey: string): void {
  const current = remembered.get(journeyId)
  remembered.set(journeyId, { dayKey, scrollY: current?.scrollY ?? 0 })
}

/** Returns and forgets the remembered position of a journey, if any. */
export function takeOverview(journeyId: string): Remembered | null {
  const found = remembered.get(journeyId) ?? null
  remembered.delete(journeyId)
  return found
}
