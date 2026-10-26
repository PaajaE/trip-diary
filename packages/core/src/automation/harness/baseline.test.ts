import { describe, expect, it } from 'vitest'
import { planOrganization } from '../organize.ts'
import { detectStops } from '../stays.ts'
import { currentAlgorithm, newAlgorithm } from './adapters.ts'
import { evaluateCanada } from './canada.ts'
import {
  scenarioPasses,
  scoreGrouping,
  splitLivePairs,
  transitStats,
} from './metrics.ts'
import * as properties from './properties.ts'
import {
  buildExtraScenarios,
  buildScenarios,
  generateEqualTimestampPoints,
  generateLongStayPoints,
  generateNoGpsPoints,
  generatePerfPoints,
  type HarnessPoint,
} from './scenarios.ts'

/**
 * ZS-0 baseline: today's `clusterMoments` measured by the harness. The
 * numbers below are a snapshot ("baseline of 2026-10-26, pre-ZS-3"). They are
 * NOT a quality bar: a scenario that fails today is expected to fail here. When
 * ZS-3/4 change the algorithm, these numbers change on purpose and the new
 * values replace them in the same commit.
 *
 * Set HARNESS_REPORT=1 to print the results as a markdown table.
 */

const scenarios = buildScenarios()
/** The 26 scenarios plus the ones added later (AA and on). */
const allScenarios = [...scenarios, ...buildExtraScenarios()]

interface BaselineRow {
  /** Edits to truth (splits + merges, see metrics.ts). */
  edits: number
  /** Predicted groups (all photos, transit included). */
  groups: number
  id: string
  /** B-cubed F1 over the stop photos. */
  f1: number
  /** Today's result meets the expectation. */
  pass: boolean
  /** Transit photos left as a one-photo "stop". */
  transitSingle: number
}

// baseline of 2026-10-26, pre-ZS-3
const BASELINE: readonly BaselineRow[] = [
  { edits: 7, f1: 0.222, groups: 1, id: 'A', pass: false, transitSingle: 0 },
  { edits: 1, f1: 0.675, groups: 2, id: 'B', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 8, id: 'C', pass: false, transitSingle: 6 },
  { edits: 2, f1: 0.625, groups: 3, id: 'D', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'E', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'F', pass: true, transitSingle: 0 },
  { edits: 2, f1: 0.512, groups: 3, id: 'G', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 7, id: 'H', pass: false, transitSingle: 6 },
  { edits: 2, f1: 0.818, groups: 7, id: 'I', pass: false, transitSingle: 4 },
  { edits: 2, f1: 0.684, groups: 2, id: 'J', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'K', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'L', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 6, id: 'M', pass: true, transitSingle: 0 },
  { edits: 1, f1: 0.667, groups: 2, id: 'N', pass: false, transitSingle: 0 },
  { edits: 1, f1: 0.667, groups: 2, id: 'O', pass: false, transitSingle: 0 },
  { edits: 38, f1: 0.095, groups: 40, id: 'P', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Q', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'R', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'S', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'T', pass: true, transitSingle: 0 },
  { edits: 7, f1: 0.222, groups: 1, id: 'U', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 6, id: 'V', pass: true, transitSingle: 0 },
  { edits: 1, f1: 0.897, groups: 2, id: 'W', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 3, id: 'X', pass: false, transitSingle: 1 },
  { edits: 0, f1: 1, groups: 1, id: 'Y', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Z', pass: true, transitSingle: 0 },
]

// baseline of 2026-10-26, pre-ZS-3
const BASELINE_CANADA = {
  edits: 21,
  editsPer100: 42.857,
  expectedGroups: 5,
  f1: 0.482,
  merges: 6,
  photos: 49,
  predictedGroups: 16,
  splits: 15,
  ungrouped: 7,
}

/**
 * HISTORY, not reproduced by live code: the table of the ZS-3 algorithm
 * (commit 537fb56), same shape as BASELINE. After ZS-3: streams, outlier
 * filter, location fill-in, smooth density, stays and points. Remaining misses
 * were ZS-4 work (en route, trips inside a day): B trek, C/H drives, G ride,
 * I loop trek, X window photo. ZS-4 replaced the dense-run hack and changed
 * the density window, so the live numbers are AFTER_ZS4; this table stays as
 * the "never worse than ZS-3" floor and for the report.
 */
// after ZS-3
const NEW_BASELINE: readonly BaselineRow[] = [
  { edits: 0, f1: 1, groups: 8, id: 'A', pass: true, transitSingle: 0 },
  { edits: 24, f1: 0.085, groups: 25, id: 'B', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 8, id: 'C', pass: false, transitSingle: 6 },
  { edits: 0, f1: 1, groups: 1, id: 'D', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'E', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'F', pass: true, transitSingle: 0 },
  { edits: 7, f1: 0.222, groups: 8, id: 'G', pass: false, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 7, id: 'H', pass: false, transitSingle: 6 },
  { edits: 8, f1: 0.818, groups: 17, id: 'I', pass: false, transitSingle: 4 },
  { edits: 0, f1: 1, groups: 4, id: 'J', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'K', pass: true, transitSingle: 0 },
  { edits: 2, f1: 0.545, groups: 3, id: 'L', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 6, id: 'M', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'N', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'O', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'P', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Q', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'R', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'S', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'T', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 8, id: 'U', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 6, id: 'V', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 3, id: 'W', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 3, id: 'X', pass: false, transitSingle: 1 },
  { edits: 0, f1: 1, groups: 1, id: 'Y', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Z', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'AA', pass: true, transitSingle: 0 },
]

// after ZS-3 (coarse v1Entry truth with 5 groups: a smoke indicator only)
const ZS3_CANADA = {
  edits: 30,
  editsPer100: 61.224,
  f1: 0.365,
  predictedGroups: 23,
}

/**
 * ZS-4 recorded table of the live algorithm (`detectStops` as the harness
 * adapter runs it: camera clock shifts as a flagged hypothesis), same shape.
 * Scenarios AA-AC were added with ZS-3/ZS-4. `groups` counts the collapsed
 * "en route" groups too; `transitSingle` ignores them (they are not stops).
 * L is accepted with 3 edits (4 groups of a pair each, tolerance 3).
 */
// after ZS-4
const AFTER_ZS4: readonly BaselineRow[] = [
  { edits: 0, f1: 1, groups: 8, id: 'A', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'B', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 5, id: 'C', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'D', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'E', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'F', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'G', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'H', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 7, id: 'I', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 4, id: 'J', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'K', pass: true, transitSingle: 0 },
  { edits: 3, f1: 0.4, groups: 4, id: 'L', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 6, id: 'M', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'N', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'O', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'P', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Q', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'R', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'S', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'T', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 8, id: 'U', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 6, id: 'V', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 3, id: 'W', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 3, id: 'X', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Y', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'Z', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 2, id: 'AA', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 7, id: 'AB', pass: true, transitSingle: 0 },
  { edits: 0, f1: 1, groups: 1, id: 'AC', pass: true, transitSingle: 0 },
]

// after ZS-4 (coarse v1Entry truth with 5 groups: a smoke indicator only)
const AFTER_CANADA = {
  edits: 30,
  editsPer100: 61.224,
  f1: 0.355,
  predictedGroups: 23,
}

/** Properties of the live algorithm: none is violated. */
const AFTER_VIOLATIONS: Record<string, readonly string[]> = {
  determinism: [],
  idempotence: [],
  interleavedFarPhotos: [],
  laterFarPhotos: [],
  orderIndependence: [],
  stableIds: [],
}

/**
 * Properties of today's algorithm. Listed are the scenarios where the
 * property is VIOLATED today (a known failing property, asserted so nothing is
 * skipped silently). A required property has an empty list.
 */
const BASELINE_VIOLATIONS: Record<string, readonly string[]> = {
  determinism: [],
  idempotence: [],
  // Far photos after the day never touch an existing group.
  laterFarPhotos: [],
  // Known failing: far photos by another author in the middle of a stop cut
  // the stop in two (no per-author streams, no outlier filter). ZS-3 target.
  interleavedFarPhotos: [
    'A',
    'B',
    'D',
    'E',
    'F',
    'G',
    'I',
    'L',
    'O',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'Y',
    'Z',
  ],
  orderIndependence: [],
  stableIds: [],
}

type Points = Parameters<properties.GroupingAlgorithm>[0]
type Check = (
  a: properties.GroupingAlgorithm,
  p: Points,
) => properties.PropertyResult

const CHECKS: Record<string, Check> = {
  determinism: properties.determinism,
  idempotence: properties.idempotence,
  interleavedFarPhotos: (a, p) =>
    properties.farPhotosKeepGroups(a, p, 'interleaved'),
  laterFarPhotos: (a, p) => properties.farPhotosKeepGroups(a, p, 'later'),
  orderIndependence: (a, p) => properties.orderIndependence(a, p),
  stableIds: properties.stableIds,
}

function evaluateScenarios(
  algorithm: properties.GroupingAlgorithm = currentAlgorithm,
  list: typeof scenarios = scenarios,
): (BaselineRow & {
  expected: number
  label: string
})[] {
  return list.map((scenario) => {
    const groups = algorithm(scenario.points)
    const predicted = groups.map((g) => g.ids)
    const score = scoreGrouping(predicted, scenario.expectedGroups)
    const transit = transitStats(
      predicted,
      scenario.transitIds,
      scenario.expectedGroups,
      groups.filter((g) => g.kind === 'en_route').map((g) => g.ids),
    )
    return {
      edits: score.edits,
      expected: scenario.expectedGroups.length,
      f1: score.bcubed.f1,
      groups: predicted.length,
      id: scenario.id,
      label: scenario.label,
      pass: scenarioPasses(score, transit, scenario.toleranceEdits),
      transitSingle: transit.single,
    }
  })
}

/** HARNESS_REPORT=1 turns on the markdown table (core has no node types). */
function reportEnabled(): boolean {
  const host = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  return host.process?.env?.HARNESS_REPORT === '1'
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

describe('ZS-0 scenarios', () => {
  it('has the 24 scenarios A-X plus Y and Z with unique ids', () => {
    expect(scenarios.map((s) => s.id).join('')).toBe(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    )
    for (const scenario of scenarios) {
      const ids = scenario.points.map((p) => p.id)
      expect(new Set(ids).size).toBe(ids.length)
      const known = new Set(ids)
      for (const id of [
        ...scenario.expectedGroups.flat(),
        ...scenario.transitIds,
      ]) {
        expect(known.has(id)).toBe(true)
      }
    }
  })

  it('is reproducible (seeded, no clock)', () => {
    expect(buildScenarios()).toEqual(scenarios)
    expect(generatePerfPoints(200, 7)).toEqual(generatePerfPoints(200, 7))
  })

  it('flags exactly the 14 scenarios that fail today', () => {
    expect(
      scenarios
        .filter((s) => s.knownFailingToday)
        .map((s) => s.id)
        .join(''),
    ).toBe('ABCDGHIJNOPUWX')
  })

  it('matches the recorded baseline of today clusterMoments', () => {
    const rows = evaluateScenarios()
    expect(rows).toHaveLength(BASELINE.length)
    for (const row of rows) {
      const recorded = BASELINE.find((b) => b.id === row.id)
      expect(recorded, row.id).toBeDefined()
      expect(
        {
          edits: row.edits,
          groups: row.groups,
          pass: row.pass,
          transitSingle: row.transitSingle,
        },
        row.id,
      ).toEqual({
        edits: recorded?.edits,
        groups: recorded?.groups,
        pass: recorded?.pass,
        transitSingle: recorded?.transitSingle,
      })
      expect(round3(row.f1), row.id).toBe(recorded?.f1)
      // The plan's "fails today" flag agrees with the measured result.
      const flagged = scenarios.find((s) => s.id === row.id)?.knownFailingToday
      expect(row.pass, row.id).toBe(!flagged)
    }
  })

  it('never splits a Live Photo pair today', () => {
    for (const scenario of scenarios) {
      const predicted = currentAlgorithm(scenario.points).map((g) => g.ids)
      expect(splitLivePairs(predicted, scenario.livePairs), scenario.id).toBe(0)
    }
  })
})

describe('ZS-0 properties of today clusterMoments', () => {
  for (const [name, check] of Object.entries(CHECKS)) {
    it(`${name}: records the known state`, () => {
      const violated = scenarios
        .filter((s) => !check(currentAlgorithm, s.points).holds)
        .map((s) => s.id)
      expect(violated).toEqual(BASELINE_VIOLATIONS[name])
    })
  }
})

describe('ZS-0 real ground truth (canada-v1)', () => {
  it('matches the recorded baseline', () => {
    const report = evaluateCanada(currentAlgorithm)
    expect(report.photos).toBe(BASELINE_CANADA.photos)
    expect(report.ungrouped).toBe(BASELINE_CANADA.ungrouped)
    expect(report.expectedGroups).toBe(BASELINE_CANADA.expectedGroups)
    expect(report.predictedGroups).toBe(BASELINE_CANADA.predictedGroups)
    expect(report.splits).toBe(BASELINE_CANADA.splits)
    expect(report.merges).toBe(BASELINE_CANADA.merges)
    expect(report.edits).toBe(BASELINE_CANADA.edits)
    expect(round3(report.editsPer100)).toBe(BASELINE_CANADA.editsPer100)
    expect(round3(report.bcubed.f1)).toBe(BASELINE_CANADA.f1)
  })
})

/** The product pipeline on a scenario: no stored moments or segments. */
function planScenario(points: readonly HarnessPoint[]) {
  let counter = 0
  return planOrganization(
    {
      media: points.map((point) => ({
        capturedAt: point.capturedAt,
        capturedTz: point.capturedTz,
        device: point.device,
        durationMs: point.durationMs,
        id: point.id,
        kind: point.kind,
        latitude: point.latitude,
        longitude: point.longitude,
        momentId: null,
        ownerId: point.author,
        placeKind: point.placeKind,
      })),
      moments: [],
      segments: [],
    },
    {
      homeTz: 'Europe/Prague',
      newId: () => {
        counter += 1
        return `id-${String(counter)}`
      },
      segmentTitle: ({ index, inDay, kind }) =>
        `${inDay === true ? 'in-day ' : ''}${kind} ${String(index)}`,
    },
  )
}

describe('ZS-4 algorithm (detectStops, en route, in-day trips)', () => {
  it('matches the recorded AFTER_ZS4', () => {
    const rows = evaluateScenarios(newAlgorithm, allScenarios)
    expect(rows).toHaveLength(AFTER_ZS4.length)
    for (const row of rows) {
      const recorded = AFTER_ZS4.find((b) => b.id === row.id)
      expect(recorded, row.id).toBeDefined()
      expect(
        {
          edits: row.edits,
          groups: row.groups,
          pass: row.pass,
          transitSingle: row.transitSingle,
        },
        row.id,
      ).toEqual({
        edits: recorded?.edits,
        groups: recorded?.groups,
        pass: recorded?.pass,
        transitSingle: recorded?.transitSingle,
      })
      expect(round3(row.f1), row.id).toBe(recorded?.f1)
    }
  })

  it('passes the ZS-4 gate: walk, trek, drive, bike, train, mixed day, X, S', () => {
    const rows = evaluateScenarios(newAlgorithm, allScenarios)
    // A city walk, B trek, C drive, G bike, H train, I mixed day, X, S
    for (const id of ['A', 'B', 'C', 'G', 'H', 'I', 'X', 'S', 'AB', 'AC']) {
      const row = rows.find((r) => r.id === id)
      expect(row?.pass, id).toBe(true)
      expect(row?.edits, id).toBe(0)
      expect(row?.transitSingle, id).toBe(0)
    }
  })

  it('passes the earlier ZS-3 gate scenarios', () => {
    const rows = evaluateScenarios(newAlgorithm, allScenarios)
    // sparse selection, outliers, clock offset, two phones, sparse day, copies
    for (const id of ['U', 'W', 'V', 'D', 'N', 'O', 'P', 'Q', 'J', 'AA']) {
      expect(rows.find((r) => r.id === id)?.pass, id).toBe(true)
    }
  })

  it('is never worse than clusterMoments or than ZS-3 (no waiver)', () => {
    const before = evaluateScenarios(currentAlgorithm, allScenarios)
    const after = evaluateScenarios(newAlgorithm, allScenarios)
    for (const row of after) {
      const tolerance =
        allScenarios.find((x) => x.id === row.id)?.toleranceEdits ?? 0
      for (const floor of [
        before.find((b) => b.id === row.id),
        NEW_BASELINE.find((b) => b.id === row.id),
      ]) {
        if (floor === undefined) continue
        expect(row.edits, row.id).toBeLessThanOrEqual(
          Math.max(floor.edits, tolerance),
        )
        expect(row.transitSingle, row.id).toBeLessThanOrEqual(
          floor.transitSingle,
        )
        if (floor.pass) expect(row.pass, row.id).toBe(true)
      }
    }
  })

  it('never splits a Live Photo pair', () => {
    for (const scenario of allScenarios) {
      const predicted = newAlgorithm(scenario.points).map((g) => g.ids)
      expect(splitLivePairs(predicted, scenario.livePairs), scenario.id).toBe(0)
    }
  })

  for (const [name, check] of Object.entries(CHECKS)) {
    it(`${name} holds`, () => {
      const violated = allScenarios
        .filter((s) => !check(newAlgorithm, s.points).holds)
        .map((s) => s.id)
      expect(violated).toEqual(AFTER_VIOLATIONS[name])
    })
  }

  it('is a partition: every id is in exactly one stop or an explicit list', () => {
    for (const scenario of allScenarios) {
      const first = scenario.points[0]
      const points: HarnessPoint[] = [
        ...scenario.points.map((p) => ({ ...p, ownerId: p.author })),
        // an undated photo next to the scenario
        ...(first === undefined
          ? []
          : [{ ...first, capturedAt: 'unknown', id: 'undated' }]),
      ]
      const result = detectStops(points)
      const seen = new Map<string, number>()
      for (const stop of result.stops) {
        for (const id of stop.mediaIds) seen.set(id, (seen.get(id) ?? 0) + 1)
      }
      for (const id of result.undatedMediaIds)
        seen.set(id, (seen.get(id) ?? 0) + 1)
      for (const point of points) {
        expect(seen.get(point.id), `${scenario.id} ${point.id}`).toBe(1)
      }
      expect(seen.size).toBe(points.length)
    }
  })

  it('finds the in-day trips as `trip` segments of the plan', () => {
    for (const scenario of allScenarios) {
      const plan = planScenario(scenario.points)
      expect(
        plan.tripSuggestions.map((trip) => trip.tripType),
        scenario.id,
      ).toEqual(scenario.expectedTrips)
      for (const trip of plan.tripSuggestions) {
        expect(trip.kind).toBe('trip')
        expect(Date.parse(trip.endsAt)).toBeGreaterThan(
          Date.parse(trip.startsAt),
        )
        expect(trip.reason, scenario.id).toBeTruthy()
        // a trip inside one day, not a stage
        expect(
          Date.parse(trip.endsAt) - Date.parse(trip.startsAt),
        ).toBeLessThan(24 * 3_600_000)
      }
    }
  })

  it('plans moments with a kind and a reason and covers every photo', () => {
    for (const scenario of allScenarios) {
      const plan = planScenario(scenario.points)
      const planned = plan.momentsToCreate.flatMap((m) => m.mediaIds)
      expect(new Set(planned).size, scenario.id).toBe(planned.length)
      expect(planned.length, scenario.id).toBe(scenario.points.length)
      for (const moment of plan.momentsToCreate) {
        expect(['stay', 'point', 'en_route']).toContain(moment.kind)
        expect(moment.reason.length).toBeGreaterThan(0)
      }
    }
    const trek = planScenario(
      allScenarios.find((s) => s.id === 'C')?.points ?? [],
    )
    expect(trek.momentsToCreate.map((m) => m.kind).join()).toBe(
      'en_route,stay,en_route,stay,en_route',
    )
  })

  it('keeps en route members addressable with a reason each', () => {
    const scenario = allScenarios.find((s) => s.id === 'X')
    const result = detectStops(
      (scenario?.points ?? []).map((p) => ({ ...p, ownerId: p.author })),
    )
    const route = result.stops.find((stop) => stop.kind === 'en_route')
    expect(route?.collapsed.map((m) => m.mediaId)).toEqual(scenario?.transitIds)
    expect(route?.collapsed.every((m) => m.reason.length > 0)).toBe(true)
    expect(route?.movement).toBe('vehicle')
    expect(route?.instant).toBe(true)
  })

  it('matches the recorded canada-v1 smoke numbers', () => {
    const report = evaluateCanada(newAlgorithm)
    expect(report.predictedGroups).toBe(AFTER_CANADA.predictedGroups)
    expect(report.edits).toBe(AFTER_CANADA.edits)
    expect(round3(report.editsPer100)).toBe(AFTER_CANADA.editsPer100)
    expect(round3(report.bcubed.f1)).toBe(AFTER_CANADA.f1)
    // History: ZS-3 had 30 edits / F1 0.365.
    expect(ZS3_CANADA.edits).toBe(30)
  })

  it('plans 5 000 photos end to end (planOrganization) in under 2 s', () => {
    const points = generatePerfPoints(5000, 7)
    const started = performance.now()
    const plan = planScenario(points)
    const ms = performance.now() - started
    console.info(
      `[harness] planOrganization 5000 photos: ${ms.toFixed(1)} ms, ${String(plan.momentsToCreate.length)} moments`,
    )
    expect(ms).toBeLessThan(2000)
    expect(plan.momentsToCreate.flatMap((m) => m.mediaIds)).toHaveLength(5000)
  })

  const heavy: [string, (n: number, seed: number) => HarnessPoint[]][] = [
    ['one all-day place (photo every 30 s)', generateLongStayPoints],
    ['equal capture timestamps', generateEqualTimestampPoints],
    ['no GPS at all', generateNoGpsPoints],
  ]
  for (const [label, make] of heavy) {
    it(`stays linear: ${label}`, () => {
      const small = make(5000, 7)
      let started = performance.now()
      const groups = newAlgorithm(small)
      const smallMs = performance.now() - started
      expect(groups.flatMap((g) => g.ids)).toHaveLength(5000)
      expect(smallMs).toBeLessThan(2000)
      const large = make(20000, 7)
      started = performance.now()
      newAlgorithm(large)
      const largeMs = performance.now() - started
      console.info(
        `[harness] ${label}: 5000 = ${smallMs.toFixed(0)} ms, 20000 = ${largeMs.toFixed(0)} ms`,
      )
      expect(largeMs).toBeLessThan(10_000)
    })
  }
})

describe('ZS-0 metrics', () => {
  it('scores a perfect grouping with zero edits', () => {
    const score = scoreGrouping([['a', 'b'], ['c']], [['b', 'a'], ['c']])
    expect(score.edits).toBe(0)
    expect(score.bcubed.f1).toBe(1)
  })

  it('counts one split and one merge', () => {
    const split = scoreGrouping([['a'], ['b'], ['c']], [['a', 'b'], ['c']])
    expect([split.splits, split.merges, split.edits]).toEqual([1, 0, 1])
    const merged = scoreGrouping([['a', 'b', 'c']], [['a', 'b'], ['c']])
    expect([merged.splits, merged.merges, merged.edits]).toEqual([0, 1, 1])
    expect(merged.editsPer100).toBeCloseTo(33.333, 3)
  })
})

describe('ZS-0 performance', () => {
  it('clusters 5 000 synthetic photos', () => {
    const points = generatePerfPoints(5000, 7)
    expect(points).toHaveLength(5000)
    const started = performance.now()
    const groups = currentAlgorithm(points)
    const ms = performance.now() - started
    console.info(
      `[harness] clusterMoments 5000 photos: ${ms.toFixed(1)} ms, ${String(groups.length)} groups`,
    )
    // Target of the plan is < 2 s for the new algorithm; this bound is generous.
    expect(ms).toBeLessThan(10_000)
    expect(groups.flatMap((g) => g.ids)).toHaveLength(5000)
  })
})

describe('ZS-0 report', () => {
  it.runIf(reportEnabled())(
    'prints markdown tables: clusterMoments, ZS-3 (recorded), ZS-4 (live)',
    () => {
      const before = evaluateScenarios(currentAlgorithm, allScenarios)
      const after = evaluateScenarios(newAlgorithm, allScenarios)
      const cell = (value: number | string): string => String(value)
      const pair = (
        old: BaselineRow | undefined,
        field: 'edits' | 'groups' | 'transitSingle',
      ) => cell(old === undefined ? '-' : old[field])
      const lines = [
        '| Scenario | Expected | Groups old / ZS-3 / ZS-4 | Edits old / ZS-3 / ZS-4 | F1 old / ZS-3 / ZS-4 | Transit single old / ZS-3 / ZS-4 | Pass old / ZS-3 / ZS-4 |',
        '| --- | ---: | ---: | ---: | ---: | ---: | :---: |',
        ...after
          .map((row) => {
            const old = before.find((item) => item.id === row.id)
            const mid = NEW_BASELINE.find((item) => item.id === row.id)
            const yes = (value: boolean | undefined) =>
              value === undefined ? '-' : value ? 'yes' : 'NO'
            return [
              `${row.id} ${row.label}`,
              cell(row.expected),
              `${pair(old, 'groups')} / ${pair(mid, 'groups')} / ${cell(row.groups)}`,
              `${pair(old, 'edits')} / ${pair(mid, 'edits')} / ${cell(row.edits)}`,
              `${old?.f1.toFixed(3) ?? '-'} / ${mid?.f1.toFixed(3) ?? '-'} / ${row.f1.toFixed(3)}`,
              `${pair(old, 'transitSingle')} / ${pair(mid, 'transitSingle')} / ${cell(row.transitSingle)}`,
              `${yes(old?.pass)} / ${yes(mid?.pass)} / ${yes(row.pass)}`,
            ].join(' | ')
          })
          .map((row) => `| ${row} |`),
      ]
      const describeCanada = (report: ReturnType<typeof evaluateCanada>) =>
        [
          `${cell(report.photos)} grouped photos`,
          `${cell(report.ungrouped)} ungrouped ignored`,
          `${cell(report.predictedGroups)} predicted vs ${cell(report.expectedGroups)} expected groups`,
          `edits ${cell(report.edits)} (${report.editsPer100.toFixed(1)} / 100 photos)`,
          `B-cubed F1 ${report.bcubed.f1.toFixed(3)}`,
        ].join(', ')
      lines.push(
        '',
        `Canada v1 clusterMoments: ${describeCanada(evaluateCanada(currentAlgorithm))}`,
        `Canada v1 ZS-3 (recorded): ${cell(ZS3_CANADA.predictedGroups)} predicted groups, edits ${cell(ZS3_CANADA.edits)} (${ZS3_CANADA.editsPer100.toFixed(1)} / 100 photos), B-cubed F1 ${ZS3_CANADA.f1.toFixed(3)}`,
        `Canada v1 detectStops (ZS-4): ${describeCanada(evaluateCanada(newAlgorithm))}`,
        `Failing scenarios old / ZS-3 / ZS-4: ${cell(before.filter((r) => !r.pass).length)} / ${cell(NEW_BASELINE.filter((r) => !r.pass).length)} / ${cell(after.filter((r) => !r.pass).length)} of ${cell(before.length)}`,
      )
      console.info(lines.join('\n'))
      expect(lines.length).toBeGreaterThan(0)
    },
  )
})
