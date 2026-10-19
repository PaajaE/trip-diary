/**
 * Formats experience times in the zone they were captured in, never the
 * device zone. A missing zone falls back to UTC and says so explicitly.
 */
function resolveZone(tz: string | null): { showZone: boolean; zone: string } {
  if (tz === null) return { showZone: true, zone: 'UTC' }
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return { showZone: false, zone: tz }
  } catch {
    return { showZone: true, zone: 'UTC' }
  }
}

function dayKey(date: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: zone,
    year: 'numeric',
  }).format(date)
}

function yearKey(date: Date, zone: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: zone,
    year: 'numeric',
  }).format(date)
}

export function formatInstantTime(
  iso: string,
  tz: string | null,
  locale: string,
): string {
  const { showZone, zone } = resolveZone(tz)
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone,
    ...(showZone ? { timeZoneName: 'short' as const } : {}),
  }).format(new Date(iso))
}

export function formatInstantDate(
  iso: string,
  tz: string | null,
  locale: string,
): string {
  const { zone } = resolveZone(tz)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: zone,
    year: 'numeric',
  }).format(new Date(iso))
}

/** "10 Jan 2026, 10:00 - 11:30" for one day, date range otherwise. */
export function formatRange(
  startsAt: string,
  endsAt: string,
  tz: string | null,
  locale: string,
  options: { withTime: boolean },
): string {
  const { zone } = resolveZone(tz)
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const sameDay = dayKey(start, zone) === dayKey(end, zone)
  const startDate = formatInstantDate(startsAt, tz, locale)
  if (!options.withTime) {
    return sameDay
      ? startDate
      : `${startDate} – ${formatInstantDate(endsAt, tz, locale)}`
  }
  const startTime = formatInstantTime(startsAt, tz, locale)
  if (sameDay) {
    return startsAt === endsAt
      ? `${startDate}, ${startTime}`
      : `${startDate}, ${startTime} – ${formatInstantTime(endsAt, tz, locale)}`
  }
  return `${startDate}, ${startTime} – ${formatInstantDate(endsAt, tz, locale)}, ${formatInstantTime(endsAt, tz, locale)}`
}

function compactDateOptions(
  locale: string,
  zone: string,
  withYear: boolean,
): Intl.DateTimeFormatOptions {
  return {
    day: 'numeric',
    month: locale.startsWith('cs') ? 'numeric' : 'short',
    timeZone: zone,
    ...(withYear ? { year: 'numeric' as const } : {}),
  }
}

/**
 * Compact range in the capture zone without a zone label, e.g.
 * "28. 5. - 2. 6. 2026" or "28. 5., 22:23 - 23:42". A missing zone falls back
 * to UTC silently.
 */
export function formatCompactRange(
  startsAt: string,
  endsAt: string,
  tz: string | null,
  locale: string,
  options: { withTime: boolean; withYear: boolean },
): string {
  const { zone } = resolveZone(tz)
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const dates = new Intl.DateTimeFormat(
    locale,
    compactDateOptions(locale, zone, options.withYear),
  )
  const time = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    }).format(date)
  const sameDay = dayKey(start, zone) === dayKey(end, zone)
  if (!options.withTime) {
    if (sameDay) return dates.format(start)
    // Intl formatRange pads the numeric cs form ("28.05.2026"); build it by
    // hand and drop the first year when both ends share it.
    const sameYear = yearKey(start, zone) === yearKey(end, zone)
    const first =
      options.withYear && sameYear
        ? new Intl.DateTimeFormat(
            locale,
            compactDateOptions(locale, zone, false),
          )
        : dates
    return `${first.format(start)} – ${dates.format(end)}`
  }
  if (sameDay) {
    return startsAt === endsAt
      ? `${dates.format(start)}, ${time(start)}`
      : `${dates.format(start)}, ${time(start)} – ${time(end)}`
  }
  return `${dates.format(start)}, ${time(start)} – ${dates.format(end)}, ${time(end)}`
}

export function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
}

/** Weekday and compact date in the capture zone, e.g. "pá 29. 5.". */
export function formatDayLabel(
  iso: string,
  tz: string | null,
  locale: string,
): string {
  const { zone } = resolveZone(tz)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: locale.startsWith('cs') ? 'numeric' : 'short',
    timeZone: zone,
    weekday: 'short',
  }).format(new Date(iso))
}
