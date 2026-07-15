import { formatLocalizedDate, resolveDateLocale } from '@trip-diary/utils'

const JUST_NOW_THRESHOLD_MS = 60_000

export function formatLastSyncTime(
  isoTimestamp: string | null,
  locale: string,
  now: Date = new Date(),
): 'just_now' | { time: string } | null {
  if (isoTimestamp === null) {
    return null
  }

  const syncedAt = new Date(isoTimestamp)
  if (Number.isNaN(syncedAt.getTime())) {
    return null
  }

  const elapsedMs = now.getTime() - syncedAt.getTime()
  if (elapsedMs >= 0 && elapsedMs < JUST_NOW_THRESHOLD_MS) {
    return 'just_now'
  }

  const dateLocale = resolveDateLocale(locale)
  return {
    time: formatLocalizedDate(isoTimestamp, dateLocale, {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
    }),
  }
}
