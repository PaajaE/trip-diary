import type { TFunction } from 'i18next'
import type {
  TimeFact,
  TransitHint,
} from '@/features/journey-flow/model/stop-review'
import {
  formatDayHeading,
  formatLocalTime,
} from '@/features/journey-workspace/lib/format-range'

/** "kolem 15:07" for one shot, "7:40–9:05" for a range. Never "Zastávka 15:07". */
export function timeFactText(
  t: TFunction,
  locale: string,
  fact: TimeFact,
): string {
  if (fact.kind === 'around') {
    return t('flow.review.around', {
      time: formatLocalTime(fact.at, fact.tz, locale),
    })
  }
  return t('flow.review.range', {
    from: formatLocalTime(fact.from, fact.tz, locale),
    to: formatLocalTime(fact.to, fact.tz, locale),
  })
}

/** "Auto, 86 km" / "Pauza 50 min". */
export function transitText(t: TFunction, hint: TransitHint): string {
  if (hint.kind === 'pause') {
    return t('flow.review.transit.pause', {
      minutes: Math.max(1, Math.round(hint.durationMs / 60_000)),
    })
  }
  return t(`flow.review.transit.${hint.mode}`, { km: hint.distanceKm })
}

/** "Pátek 5. června" for a local day key (YYYY-MM-DD). */
export function dayHeading(key: string, locale: string): string {
  return formatDayHeading(`${key}T12:00:00.000Z`, 'UTC', locale)
}

/** Joins non-empty facts with a middle dot. */
export function joinFacts(parts: readonly (string | null | undefined)[]) {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' · ')
}
