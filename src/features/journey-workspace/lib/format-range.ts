import { timeZoneAt } from '@trip-diary/core/automation'

/**
 * Formats experience times in the zone they were captured in. A missing or
 * invalid zone falls back to the device zone; a zone label is never printed.
 */
function resolveZone(tz: string | null): { zone: string } {
  return { zone: validZone(tz) ?? browserZone() }
}

/** IANA zone of the device; last resort when nothing else is known. */
export function browserZone(): string {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function validZone(tz: string | null): string | null {
  if (tz === null) return null
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return tz
  } catch {
    return null
  }
}

/**
 * Clock time in the experience zone without any zone label. A missing or
 * invalid zone falls back to the device zone, never to a printed "UTC".
 */
export function formatLocalTime(
  iso: string,
  tz: string | null,
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: validZone(tz) ?? browserZone(),
  }).format(new Date(iso))
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
  return formatLocalTime(iso, tz, locale)
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
/** "Středa 3. června" / "Wednesday 3 June" in the capture zone. */
export function formatDayHeading(
  iso: string,
  tz: string | null,
  locale: string,
): string {
  const { zone } = resolveZone(tz)
  // Plain "en" resolves to US order ("Wednesday, June 3"); use day-first.
  const intlLocale = locale.startsWith('en') ? 'en-GB' : locale
  const text = new Intl.DateTimeFormat(intlLocale, {
    day: 'numeric',
    month: 'long',
    timeZone: zone,
    weekday: 'long',
  }).format(new Date(iso))
  return text.charAt(0).toLocaleUpperCase(intlLocale) + text.slice(1)
}

/**
 * Short span such as "2 min" or "1 h 15 min". Empty below one minute, for a
 * missing or invalid end, or when the end is not after the start.
 */
export function formatSpan(startsAt: string, endsAt: string): string {
  const ms = Date.parse(endsAt) - Date.parse(startsAt)
  if (Number.isNaN(ms)) return ''
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${String(rest)} min`
  return rest === 0
    ? `${String(hours)} h`
    : `${String(hours)} h ${String(rest)} min`
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000

/**
 * Text under a moment's start time. A moment that lasts 12 h or more, or that
 * crosses a local midnight, shows its dates ("26.-27. 5." / "26-27 May");
 * anything shorter shows the plain duration. Empty when there is nothing
 * meaningful to show.
 */
export function formatMomentSpan(
  startsAt: string,
  endsAt: string,
  tz: string | null,
  locale: string,
): string {
  const startMs = Date.parse(startsAt)
  const endMs = Date.parse(endsAt)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return formatSpan(startsAt, endsAt)
  }
  const zone = validZone(tz) ?? browserZone()
  const start = new Date(startMs)
  const end = new Date(endMs)
  const crossesMidnight = dayKey(start, zone) !== dayKey(end, zone)
  if (endMs - startMs < TWELVE_HOURS_MS && !crossesMidnight) {
    return formatSpan(startsAt, endsAt)
  }
  const cs = locale.startsWith('cs')
  const part = (date: Date) => {
    const parts = new Intl.DateTimeFormat(cs ? 'cs' : 'en-GB', {
      day: 'numeric',
      month: cs ? 'numeric' : 'short',
      timeZone: zone,
    }).formatToParts(date)
    const pick = (type: string) =>
      parts.find((x) => x.type === type)?.value ?? ''
    return { day: pick('day'), month: pick('month') }
  }
  const a = part(start)
  const b = part(end)
  if (a.day === b.day && a.month === b.month) {
    return cs ? `${a.day}. ${a.month}.` : `${a.day} ${a.month}`
  }
  if (a.month === b.month) {
    return cs
      ? `${a.day}.\u2013${b.day}. ${a.month}.`
      : `${a.day}\u2013${b.day} ${a.month}`
  }
  return cs
    ? `${a.day}. ${a.month}.\u2013${b.day}. ${b.month}.`
    : `${a.day} ${a.month} \u2013 ${b.day} ${b.month}`
}

/**
 * Zone of a media item for display: its capture zone, else the zone at its
 * coordinates, else the zone of its moment (may be null: device zone).
 */
export function mediaDisplayZone(
  item: {
    capturedTz: string | null
    latitude: number | null
    longitude: number | null
  },
  momentTz: string | null,
): string | null {
  if (item.capturedTz !== null) return item.capturedTz
  if (item.latitude !== null && item.longitude !== null) {
    try {
      return timeZoneAt(item.latitude, item.longitude)
    } catch {
      /* fall through */
    }
  }
  return momentTz
}
