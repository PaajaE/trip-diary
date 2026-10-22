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
