import { findDuplicateGroups } from '../duplicates.ts'
import { findJunkCandidates } from '../junk.ts'
import { summarizeZonedDays } from '../days.ts'
import { planJourney, type JourneyDay } from '../journey-plan.ts'
import type { GoldenSet } from './golden.ts'
import {
  boundaryF1,
  dayAssignmentAccuracy,
  duplicatePairScore,
  junkScore,
  type F1Score,
  type Ratio,
} from './metrics.ts'

/** Targets from the v2 plan (Phase 4f gate). UNVERIFIED until measured. */
export const SCORE_TARGETS = {
  boundaryF1: 0.9,
  dayAssignment: 0.98,
  duplicatePrecision: 0.995,
  /** Maximum, not minimum. */
  junkFalsePositiveRate: 0.005,
} as const

export const STAGE_BOUNDARY_TOLERANCE_DAYS = 1

export interface SetScore {
  boundaries: F1Score | null
  dayAssignment: Ratio | null
  duplicates: { precision: Ratio; recall: Ratio } | null
  junk: { falsePositiveRate: Ratio; recall: Ratio } | null
  name: string
}

export function scoreGoldenSet(set: GoldenSet): SetScore {
  const days = summarizeZonedDays(set.media, set.homeTimeZone)

  const { truth } = set
  let dayAssignment: Ratio | null = null
  if (truth.dayByMediaId !== undefined) {
    const predicted: Record<string, string> = {}
    for (const day of days) {
      for (const id of day.mediaIds) predicted[id] = day.date
    }
    dayAssignment = dayAssignmentAccuracy(predicted, truth.dayByMediaId)
  }

  let boundaries: F1Score | null = null
  if (truth.stageStarts !== undefined) {
    const located: JourneyDay[] = []
    for (const day of days) {
      if (
        day.centroid !== null &&
        day.firstPoint !== null &&
        day.lastPoint !== null
      ) {
        located.push({
          centre: day.centroid,
          date: day.date,
          first: day.firstPoint,
          last: day.lastPoint,
          mediaIds: day.mediaIds,
          photoCount: day.points.length,
          places: [],
          points: day.points,
          timeZone: day.timeZone,
        })
      }
    }
    const starts = planJourney(located)
      .slice(1)
      .map((stage) => stage.days[0]?.date)
      .filter((date): date is string => date !== undefined)
    boundaries = boundaryF1(
      starts,
      truth.stageStarts,
      STAGE_BOUNDARY_TOLERANCE_DAYS,
    )
  }

  const duplicates =
    truth.duplicateGroups === undefined
      ? null
      : duplicatePairScore(
          findDuplicateGroups(set.media),
          truth.duplicateGroups,
        )

  let junk: SetScore['junk'] = null
  if (truth.junkIds !== undefined) {
    const photos = set.media.filter((item) => item.kind !== 'video')
    const flagged = findJunkCandidates(
      photos.map((item) => ({
        height: item.height ?? null,
        id: item.id,
        kind: 'photo' as const,
        latitude: item.latitude,
        longitude: item.longitude,
        quality: item.quality ?? null,
        starred: item.starred ?? false,
        ...(item.screenshot === undefined
          ? {}
          : { screenshot: item.screenshot }),
        width: item.width ?? null,
      })),
    ).map((candidate) => candidate.id)
    junk = junkScore(flagged, truth.junkIds, photos.length)
  }

  return { boundaries, dayAssignment, duplicates, junk, name: set.name }
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)} %`
}

function cell(value: number | null, target: number): string {
  if (value === null) return '-'
  return `${pct(value)} ${value >= target ? 'ok' : 'MISS'}`
}

function junkCell(rate: number | null): string {
  if (rate === null) return '-'
  return `${pct(rate)} ${rate <= SCORE_TARGETS.junkFalsePositiveRate ? 'ok' : 'MISS'}`
}

/** Plain-text table, one row per set. */
export function formatScorecard(scores: readonly SetScore[]): string {
  const header = [
    'sada',
    'den',
    'hranice etap F1',
    'duplicity (přesnost)',
    'odpad (falešně)',
  ]
  const rows = scores.map((score) => [
    score.name,
    cell(score.dayAssignment?.rate ?? null, SCORE_TARGETS.dayAssignment),
    cell(score.boundaries?.f1 ?? null, SCORE_TARGETS.boundaryF1),
    cell(
      score.duplicates?.precision.rate ?? null,
      SCORE_TARGETS.duplicatePrecision,
    ),
    junkCell(score.junk?.falsePositiveRate.rate ?? null),
  ])
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
  )
  const line = (row: readonly string[]): string =>
    row.map((text, column) => text.padEnd(widths[column] ?? 0)).join('  ')
  return [line(header), ...rows.map(line)].join('\n')
}

/** True when every measured value of every set meets its target. */
export function meetsTargets(scores: readonly SetScore[]): boolean {
  return scores.every(
    (score) =>
      (score.dayAssignment?.rate ?? 1) >= SCORE_TARGETS.dayAssignment &&
      (score.boundaries?.f1 ?? 1) >= SCORE_TARGETS.boundaryF1 &&
      (score.duplicates?.precision.rate ?? 1) >=
        SCORE_TARGETS.duplicatePrecision &&
      (score.junk?.falsePositiveRate.rate ?? 0) <=
        SCORE_TARGETS.junkFalsePositiveRate,
  )
}
