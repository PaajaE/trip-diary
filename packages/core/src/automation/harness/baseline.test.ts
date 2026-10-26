import { describe, expect, it } from 'vitest'
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
  generatePerfPoints,
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
 * ZS-3 recorded table of the NEW algorithm (`detectStops`), same shape as
 * BASELINE. After ZS-3: streams, outlier filter, location fill-in, smooth
 * density, stays and points. Not wired into the pipeline yet. Remaining
 * misses are ZS-4 work (en route, trips inside a day): B trek, C/H drives,
 * G ride, I loop trek, X window photo. Compared with the baseline, B, G and I
 * have more edits because a trek or ride with a photo every 10+ min is a
 * chain of valid points until ZS-4 groups it into a trip.
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
const NEW_CANADA = {
  edits: 30,
  editsPer100: 61.224,
  f1: 0.365,
  predictedGroups: 23,
}

/** Properties of the new algorithm violated today (known, asserted). */
const NEW_VIOLATIONS: Record<string, readonly string[]> = {
  determinism: [],
  // L: isolated, a chain of two pairs 29 min apart sees a denser local median
  // and splits again (the density depends on the neighbouring photos).
  idempotence: ['L'],
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
    const predicted = algorithm(scenario.points).map((g) => g.ids)
    const score = scoreGrouping(predicted, scenario.expectedGroups)
    const transit = transitStats(
      predicted,
      scenario.transitIds,
      scenario.expectedGroups,
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

describe('ZS-3 new algorithm (detectStops)', () => {
  it('matches the recorded NEW_BASELINE', () => {
    const rows = evaluateScenarios(newAlgorithm, allScenarios)
    expect(rows).toHaveLength(NEW_BASELINE.length)
    for (const row of rows) {
      const recorded = NEW_BASELINE.find((b) => b.id === row.id)
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

  it('passes the ZS-3 gate scenarios', () => {
    const rows = evaluateScenarios(newAlgorithm, allScenarios)
    // sparse selection, outliers, clock offset, two phones, sparse day, copies
    for (const id of ['U', 'W', 'V', 'D', 'N', 'O', 'P', 'Q', 'J', 'AA']) {
      expect(rows.find((r) => r.id === id)?.pass, id).toBe(true)
    }
  })

  it('is never worse than clusterMoments where it matters now', () => {
    const before = evaluateScenarios(currentAlgorithm, allScenarios)
    const after = evaluateScenarios(newAlgorithm, allScenarios)
    // B, G, I are the in-day trip scenarios (ZS-4): a trek or ride with a
    // photo every 10+ min is a chain of points until trips exist.
    const zs4 = new Set(['B', 'G', 'I'])
    for (const row of after) {
      if (zs4.has(row.id)) continue
      const old = before.find((b) => b.id === row.id)
      const tolerance = allScenarios.find(
        (x) => x.id === row.id,
      )?.toleranceEdits
      expect(row.edits, row.id).toBeLessThanOrEqual(
        Math.max(old?.edits ?? 0, tolerance ?? 0),
      )
      expect(row.transitSingle, row.id).toBeLessThanOrEqual(
        old?.transitSingle ?? 0,
      )
      if (old?.pass === true) expect(row.pass, row.id).toBe(true)
    }
  })

  it('never splits a Live Photo pair', () => {
    for (const scenario of allScenarios) {
      const predicted = newAlgorithm(scenario.points).map((g) => g.ids)
      expect(splitLivePairs(predicted, scenario.livePairs), scenario.id).toBe(0)
    }
  })

  for (const [name, check] of Object.entries(CHECKS)) {
    it(`${name}: records the known state`, () => {
      const violated = allScenarios
        .filter((s) => !check(newAlgorithm, s.points).holds)
        .map((s) => s.id)
      expect(violated).toEqual(NEW_VIOLATIONS[name])
    })
  }

  it('matches the recorded canada-v1 smoke numbers', () => {
    const report = evaluateCanada(newAlgorithm)
    expect(report.predictedGroups).toBe(NEW_CANADA.predictedGroups)
    expect(report.edits).toBe(NEW_CANADA.edits)
    expect(round3(report.editsPer100)).toBe(NEW_CANADA.editsPer100)
    expect(round3(report.bcubed.f1)).toBe(NEW_CANADA.f1)
  })

  it('groups 5 000 photos in under 2 s', () => {
    const points = generatePerfPoints(5000, 7)
    const started = performance.now()
    const groups = newAlgorithm(points)
    const ms = performance.now() - started
    console.info(
      `[harness] detectStops 5000 photos: ${ms.toFixed(1)} ms, ${String(groups.length)} groups`,
    )
    expect(ms).toBeLessThan(2000)
    expect(groups.flatMap((g) => g.ids)).toHaveLength(5000)
  })
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
    'prints a markdown table, clusterMoments vs detectStops',
    () => {
      const before = evaluateScenarios(currentAlgorithm, allScenarios)
      const after = evaluateScenarios(newAlgorithm, allScenarios)
      const cell = (value: number | string): string => String(value)
      const lines = [
        '| Scenario | Expected | Groups old / new | Edits old / new | F1 old / new | Transit single old / new | Pass old / new |',
        '| --- | ---: | ---: | ---: | ---: | ---: | :---: |',
        ...before
          .map((old, index) => {
            const row = after[index]
            if (row === undefined) return ''
            return [
              `${old.id} ${old.label}`,
              cell(old.expected),
              `${cell(old.groups)} / ${cell(row.groups)}`,
              `${cell(old.edits)} / ${cell(row.edits)}`,
              `${old.f1.toFixed(3)} / ${row.f1.toFixed(3)}`,
              `${cell(old.transitSingle)} / ${cell(row.transitSingle)}`,
              `${old.pass ? 'yes' : 'NO'} / ${row.pass ? 'yes' : 'NO'}`,
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
        `Canada v1 detectStops: ${describeCanada(evaluateCanada(newAlgorithm))}`,
        `Failing scenarios old / new: ${cell(before.filter((r) => !r.pass).length)} / ${cell(after.filter((r) => !r.pass).length)} of ${cell(before.length)}`,
      )
      console.info(lines.join('\n'))
      expect(lines.length).toBeGreaterThan(0)
    },
  )
})
