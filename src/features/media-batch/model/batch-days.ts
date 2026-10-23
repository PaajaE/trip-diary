import type { MediaItem } from '@/entities/media/model/media-library'
import { mediaDisplayZone } from '@/features/journey-workspace/lib/format-range'
import {
  localDayKey,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'

export { UNKNOWN_DAY }

export interface BatchDay {
  /** Local day key ("2026-06-03") or UNKNOWN_DAY. */
  key: string
  /** Media of the day in capture order. */
  items: MediaItem[]
  /** Instant and zone to format the day heading from; null for UNKNOWN_DAY. */
  heading: { iso: string; tz: string | null } | null
}

function time(item: MediaItem): number {
  return item.capturedAt === null ? Infinity : Date.parse(item.capturedAt)
}

/**
 * Groups media by local calendar day, each in the zone it was captured in
 * (capture zone, else zone at its coordinates). Days ascend; media without a
 * capture time form one trailing UNKNOWN_DAY group. Within a day: capture
 * time, then id, so the order is stable across refetches.
 */
export function groupBatchByDay(items: readonly MediaItem[]): BatchDay[] {
  const days = new Map<string, BatchDay>()
  for (const item of items) {
    const tz = mediaDisplayZone(item, null)
    const key = localDayKey(item.capturedAt, tz) ?? UNKNOWN_DAY
    let day = days.get(key)
    if (day === undefined) {
      day = {
        heading:
          key === UNKNOWN_DAY || item.capturedAt === null
            ? null
            : { iso: item.capturedAt, tz },
        items: [],
        key,
      }
      days.set(key, day)
    }
    day.items.push(item)
  }
  for (const day of days.values()) {
    day.items.sort((a, b) => {
      const delta = time(a) - time(b)
      if (delta !== 0 && !Number.isNaN(delta)) return delta
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  }
  return [...days.values()].sort((a, b) => {
    if (a.key === UNKNOWN_DAY) return 1
    if (b.key === UNKNOWN_DAY) return -1
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
}

/** Flat reading order of the grid, for range selection. */
export function batchOrder(days: readonly BatchDay[]): string[] {
  return days.flatMap((day) => day.items.map((item) => item.id))
}
