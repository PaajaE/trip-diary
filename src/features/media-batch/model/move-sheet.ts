/**
 * Data of the "Move to" sheet: the stops of the journey with what the sheet
 * shows about each, the stop nearest in time to the selection (for the
 * previous / next buttons) and the suggested stop.
 */
import { suggestStop } from '@trip-diary/core/automation'
import type { TFunction } from 'i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { formatCompactRange } from '@/features/journey-workspace/lib/format-range'
import { visibleTitle } from '@/features/journey-workspace/lib/moment-labels'
import {
  collectMoments,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

export interface MoveSheetStop {
  cover: MediaItem | null
  endsAt: string
  id: string
  latitude: number | null
  longitude: number | null
  photoCount: number
  startsAt: string
  /** Title, else "Stop N" (N = position in the journey). */
  title: string
  /** Time range in the stop's zone. */
  when: string
  videoCount: number
}

/** Every stop in document order. */
export function buildMoveStops(
  tree: WorkspaceTree,
  t: TFunction,
  locale: string,
): MoveSheetStop[] {
  return collectMoments(tree).map((entry, index) => {
    const { moment } = entry
    return {
      cover: entry.cover,
      endsAt: moment.endsAt,
      id: moment.id,
      latitude: moment.latitude,
      longitude: moment.longitude,
      photoCount: entry.photoCount,
      startsAt: moment.startsAt,
      title:
        visibleTitle(entry, null) ||
        t('dayDetail.stopNumber', { n: index + 1 }),
      videoCount: entry.videoCount,
      when: formatCompactRange(
        moment.startsAt,
        moment.endsAt,
        entry.tz,
        locale,
        {
          withTime: true,
          withYear: false,
        },
      ),
    }
  })
}

/** Index of the stop nearest in time to the instant (0 gap when inside). */
export function nearestStopIndex(
  stops: readonly Pick<MoveSheetStop, 'endsAt' | 'startsAt'>[],
  capturedAt: string | null,
): number | null {
  if (capturedAt === null) return null
  const at = Date.parse(capturedAt)
  if (Number.isNaN(at)) return null
  let best: number | null = null
  let bestGap = Infinity
  stops.forEach((stop, index) => {
    const start = Date.parse(stop.startsAt)
    const end = Date.parse(stop.endsAt)
    if (Number.isNaN(start) || Number.isNaN(end)) return
    const gap = at < start ? start - at : at > end ? at - end : 0
    if (gap < bestGap) {
      best = index
      bestGap = gap
    }
  })
  return best
}

export interface MoveSheetModel {
  nextId: string | null
  prevId: string | null
  /** Why prev / next are unavailable altogether; null when they can work. */
  unavailable: 'noStops' | 'noTime' | null
  suggestedId: string | null
}

/** Neighbours and suggestion relative to the first selected media. */
export function moveSheetModel(
  stops: readonly MoveSheetStop[],
  first: MediaItem | undefined,
): MoveSheetModel {
  if (stops.length === 0) {
    return {
      nextId: null,
      prevId: null,
      suggestedId: null,
      unavailable: 'noStops',
    }
  }
  const nearest = nearestStopIndex(stops, first?.capturedAt ?? null)
  const suggestion =
    first === undefined
      ? null
      : suggestStop(
          {
            capturedAt: first.capturedAt,
            latitude: first.latitude,
            longitude: first.longitude,
          },
          stops,
        )
  return {
    nextId: nearest === null ? null : (stops[nearest + 1]?.id ?? null),
    prevId: nearest === null ? null : (stops[nearest - 1]?.id ?? null),
    suggestedId: suggestion?.stopId ?? null,
    unavailable: nearest === null ? 'noTime' : null,
  }
}
