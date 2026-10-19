/**
 * Trash retention shown to the user. Automatic purge after this many days is
 * not implemented server-side yet; the UI only displays the countdown.
 */
export const TRASH_RETENTION_DAYS = 30
const DAY_MS = 86_400_000

/** Whole days left until deleted_at + 30 days; never negative. */
export function trashDaysLeft(deletedAt: string, now: number): number {
  const expires = Date.parse(deletedAt) + TRASH_RETENTION_DAYS * DAY_MS
  return Math.max(0, Math.ceil((expires - now) / DAY_MS))
}
