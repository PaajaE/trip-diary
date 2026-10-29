import type { StopName } from '@trip-diary/core/automation'
import type { TFunction } from 'i18next'
import { formatLocalTime } from '@/features/journey-workspace/lib/format-range'
import { DEFAULT_MEDIA_BASE_URL } from '@/features/journey-workspace/lib/media-thumb'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import { publicEnv } from '@/shared/config/env'

export const BASE_URL = publicEnv.mediaBaseUrl ?? DEFAULT_MEDIA_BASE_URL

/** "3 trips · 41 photos · 2 videos"; empty parts are left out. */
export function countsText(
  t: TFunction,
  parts: { photos: number; trips?: number; videos: number },
): string {
  const out: string[] = []
  if ((parts.trips ?? 0) > 0)
    out.push(t('terms.trip.count', { count: parts.trips }))
  if (parts.photos > 0)
    out.push(t('terms.photo.count', { count: parts.photos }))
  if (parts.videos > 0)
    out.push(t('terms.video.count', { count: parts.videos }))
  return out.join(' · ')
}

/** Title shown on the card: the title, else the place name, else nothing. */
export function visibleTitle(
  entry: WorkspaceMoment,
  placeNames: ReadonlyMap<string, string> | null,
): string {
  if (entry.moment.title !== null && entry.moment.title !== '')
    return entry.moment.title
  const place =
    entry.moment.placeId === null
      ? undefined
      : placeNames?.get(entry.moment.placeId)
  return place?.trim() ?? ''
}

export interface StopLabel {
  /** The name is still being looked up; `text` is then the placeholder. */
  pending: boolean
  text: string
}

/** Weekday name (0 = Sunday) in the UI language. */
function weekdayName(weekday: number, locale: string): string {
  // 2026-01-04 is a Sunday; formatting a fixed date reads no clock.
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(Date.UTC(2026, 0, 4 + weekday))
}

/**
 * Text of a derived stop name (core `deriveStopNames`): manual title, place,
 * "quarter, city", "near city" or "Thursday afternoon", plus " · morning"
 * and a number when names repeat within a day. Pending = skeleton text.
 */
export function stopNameText(
  name: StopName,
  t: TFunction,
  locale: string,
): StopLabel {
  const { base } = name
  if (base.kind === 'pending') {
    return { pending: true, text: t('workspace.lookingUpPlace') }
  }
  let text: string
  if (base.kind === 'title' || base.kind === 'place') text = base.text
  else if (base.kind === 'district') {
    text = t('workspace.stopName.district', {
      city: base.city,
      district: base.district,
    })
  } else if (base.kind === 'near') {
    text = t('workspace.stopName.near', { place: base.city })
  } else {
    text = t('workspace.stopName.dayPart', {
      period: t(`workspace.stopName.period.${base.period}`),
      weekday: weekdayName(base.weekday, locale),
    })
  }
  if (name.period !== null) {
    text = t('workspace.stopName.withPeriod', {
      name: text,
      period: t(`workspace.stopName.period.${name.period}`),
    })
  }
  if (name.ordinal !== null) {
    text = t('workspace.stopName.ordinal', { n: name.ordinal, name: text })
  }
  return { pending: false, text }
}

/**
 * Label of a stop in lists: title, else place name. Without either, a stop
 * that has (or will get) a place shows "looking up the place" and one that
 * never can (no coordinates, no place) shows "Stop N". Never a made-up
 * "Stop 15:07" title. With a derived `name` (core `deriveStopNames`, which
 * knows the other stops of the day) that name is used instead.
 */
export function stopLabel(
  entry: WorkspaceMoment,
  placeNames: ReadonlyMap<string, string> | null,
  t: TFunction,
  position: number,
  derived?: { locale: string; name: StopName },
): StopLabel {
  if (derived !== undefined) {
    return stopNameText(derived.name, t, derived.locale)
  }
  const shown = visibleTitle(entry, placeNames)
  if (shown !== '') return { pending: false, text: shown }
  const { latitude, longitude, placeId } = entry.moment
  if (placeId !== null || (latitude !== null && longitude !== null)) {
    return { pending: true, text: t('workspace.lookingUpPlace') }
  }
  return { pending: false, text: t('dayDetail.stopNumber', { n: position }) }
}

/** Name for menus, dialogs, the viewer and screen readers (never empty). */
export function momentTitle(
  entry: WorkspaceMoment,
  t: TFunction,
  locale: string,
  placeNames: ReadonlyMap<string, string> | null = null,
): string {
  const shown = visibleTitle(entry, placeNames)
  return shown !== ''
    ? shown
    : t('workspace.untitledMoment', {
        time: formatLocalTime(entry.moment.startsAt, entry.tz, locale),
      })
}

/** Map tooltip: title, else place name, else the time (never "Moment ..."). */
export function pinLabel(
  entry: WorkspaceMoment,
  placeNames: ReadonlyMap<string, string>,
  locale: string,
): string {
  const shown = visibleTitle(entry, placeNames)
  return shown !== ''
    ? shown
    : formatLocalTime(entry.moment.startsAt, entry.tz, locale)
}
