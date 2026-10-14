import {
  formatInZone,
  type JourneyModel,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'
import type { PublicSegment } from '@trip-diary/core/public-journey'

export function formatDateRange(
  model: JourneyModel,
  segment: PublicSegment,
  locale: string,
): string {
  const zone = zoneOf(model, segment)
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }
  const from = formatInZone(segment.startsAt, zone, locale, opts)
  const to = formatInZone(segment.endsAt, zone, locale, opts)
  return from === to ? from : `${from} – ${to}`
}

export function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${String(meters)} m`
}

export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}
