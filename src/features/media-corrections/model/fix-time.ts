import type { MediaItem } from '@/entities/media/model/media-library'
import { MAX_SHIFT_SECONDS } from '@/entities/media/model/media-library'
import {
  formatInstantDate,
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'

export { MAX_SHIFT_SECONDS }

export const HOUR = 3600
export const MINUTE = 60
export const DAY = 86_400

/** Quick shifts (seconds); each one is added to the current shift. */
export const SHIFT_PRESETS = {
  dayBehind: DAY,
  dayAhead: -DAY,
  halfHourMinus: -30 * MINUTE,
  halfHourPlus: 30 * MINUTE,
  hourMinus: -HOUR,
  hourPlus: HOUR,
} as const

export type ShiftPresetKey = keyof typeof SHIFT_PRESETS

type TimedItem = Pick<MediaItem, 'capturedAt' | 'capturedTz'> &
  Partial<Pick<MediaItem, 'latitude' | 'longitude'>>

export type ShiftValidity = 'ok' | 'tooLarge' | 'zero'

export function validateShift(deltaSeconds: number): ShiftValidity {
  if (!Number.isInteger(deltaSeconds)) return 'tooLarge'
  if (Math.abs(deltaSeconds) > MAX_SHIFT_SECONDS) return 'tooLarge'
  return deltaSeconds === 0 ? 'zero' : 'ok'
}

/** How many items the RPC will really change: those with a capture time. */
export function shiftableCount(items: readonly TimedItem[]): number {
  return items.filter((item) => item.capturedAt !== null).length
}

/** Adds a step to the shift (a preset, or one press of a stepper button). */
export function stepShift(deltaSeconds: number, stepSeconds: number): number {
  return deltaSeconds + stepSeconds
}

export interface ShiftParts {
  hours: number
  minutes: number
  negative: boolean
}

/** The shift as sign + whole hours + minutes (seconds are not offered). */
export function splitShift(deltaSeconds: number): ShiftParts {
  const total = Math.floor(Math.abs(deltaSeconds) / MINUTE)
  return {
    hours: Math.floor(total / 60),
    minutes: total % 60,
    negative: deltaSeconds < 0,
  }
}

export interface ShiftPreviewSide {
  date: string
  time: string
}

export interface ShiftPreview {
  after: ShiftPreviewSide
  before: ShiftPreviewSide
  /** True when the date (not only the clock time) differs. */
  dateChanges: boolean
}

function side(
  iso: string,
  zone: string | null,
  locale: string,
): ShiftPreviewSide {
  return {
    date: formatInstantDate(iso, zone, locale),
    time: formatLocalTime(iso, zone, locale),
  }
}

/**
 * Displayed time of the first item that has a capture time, before and after
 * the shift, in that item's own zone. Arithmetic on the parsed stored instant
 * only; the current clock is never read. Null when no item has a capture time
 * or the shifted instant is not representable.
 */
export function shiftPreview(
  items: readonly TimedItem[],
  deltaSeconds: number,
  locale: string,
  fallbackZone: string | null = null,
): ShiftPreview | null {
  const first = items.find((item) => item.capturedAt !== null)
  if (first?.capturedAt == null) return null
  const start = Date.parse(first.capturedAt)
  if (Number.isNaN(start)) return null
  const shifted = new Date(start + deltaSeconds * 1000)
  if (Number.isNaN(shifted.getTime())) return null
  const zone = mediaDisplayZone(
    {
      capturedTz: first.capturedTz,
      latitude: first.latitude ?? null,
      longitude: first.longitude ?? null,
    },
    fallbackZone,
  )
  const before = side(first.capturedAt, zone, locale)
  const after = side(shifted.toISOString(), zone, locale)
  return { after, before, dateChanges: before.date !== after.date }
}
