import { wallClockToInstant } from '@trip-diary/core/automation'
import type {
  ImportCandidate,
  ImportRange,
} from '@/features/media-import/model/types'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 'YYYY-MM-DD' of the day after `day` (calendar arithmetic only). */
function nextDay(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (match === null) return null
  const next = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1),
  )
  return `${String(next.getUTCFullYear())}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

/**
 * Turns two calendar days (inclusive, as typed in the date inputs) into the
 * instants [start of `fromDay`, start of the day after `toDay`) in `timeZone`.
 * The zone is the device calendar and is used only to filter instants; it is
 * never stored as an experience time zone.
 */
export function dayRange(
  fromDay: string | null,
  toDay: string | null,
  timeZone: string,
): ImportRange {
  const range: ImportRange = {}
  if (fromDay !== null && fromDay !== '') {
    const from = wallClockToInstant(`${fromDay} 00:00:00`, timeZone)
    if (from !== null) range.from = from
  }
  if (toDay !== null && toDay !== '') {
    const after = nextDay(toDay)
    const to =
      after === null ? null : wallClockToInstant(`${after} 00:00:00`, timeZone)
    if (to !== null) range.to = to
  }
  return range
}

export function isBoundedRange(range: ImportRange | undefined): boolean {
  return range?.from !== undefined || range?.to !== undefined
}

/** "Since the last import": strictly after the cursor instant. */
export function sinceRange(lastCapturedAt: string): ImportRange {
  return { from: new Date(Date.parse(lastCapturedAt) + 1).toISOString() }
}

/**
 * Applies a range to candidates. Candidates already skipped keep their
 * reason. With a bounded range, a candidate without a capture time cannot be
 * placed and becomes skipped as `no_capture_time`; out-of-range ones are
 * dropped (they are simply not part of this import).
 */
export function applyRange(
  candidates: readonly ImportCandidate[],
  range: ImportRange | undefined,
): ImportCandidate[] {
  if (!isBoundedRange(range)) return [...candidates]
  const from = range?.from === undefined ? null : Date.parse(range.from)
  const to = range?.to === undefined ? null : Date.parse(range.to)
  const result: ImportCandidate[] = []
  for (const candidate of candidates) {
    if (candidate.capturedAt === null) {
      result.push(
        candidate.skipReason === undefined
          ? { ...candidate, skipReason: 'no_capture_time' }
          : candidate,
      )
      continue
    }
    const at = Date.parse(candidate.capturedAt)
    if (from !== null && at < from) continue
    if (to !== null && at >= to) continue
    result.push(candidate)
  }
  return result
}

export interface CandidateSummary {
  photos: number
  skipped: Partial<Record<NonNullable<ImportCandidate['skipReason']>, number>>
  skippedTotal: number
  videos: number
}

export function summarizeCandidates(
  candidates: readonly ImportCandidate[],
): CandidateSummary {
  const summary: CandidateSummary = {
    photos: 0,
    skipped: {},
    skippedTotal: 0,
    videos: 0,
  }
  for (const candidate of candidates) {
    if (candidate.skipReason !== undefined) {
      summary.skipped[candidate.skipReason] =
        (summary.skipped[candidate.skipReason] ?? 0) + 1
      summary.skippedTotal += 1
    } else if (candidate.mediaType === 'photo') {
      summary.photos += 1
    } else {
      summary.videos += 1
    }
  }
  return summary
}

export type RangeChoice =
  | { mode: 'all' }
  | { fromDay: string; mode: 'dates'; timeZone: string; toDay: string }
  | { lastCapturedAt: string; mode: 'since' }

/** The range a UI choice stands for (undefined = everything). */
export function resolveRange(choice: RangeChoice): ImportRange | undefined {
  switch (choice.mode) {
    case 'all':
      return undefined
    case 'since':
      return sinceRange(choice.lastCapturedAt)
    case 'dates':
      return dayRange(choice.fromDay, choice.toDay, choice.timeZone)
  }
}
