import { describe, expect, it } from 'vitest'
import { currentAlgorithm } from './adapters.ts'
import { evaluateCanada } from './canada.ts'
import {
  scenarioPasses,
  scoreGrouping,
  splitLivePairs,
  transitStats,
} from './metrics.ts'
import * as properties from './properties.ts'
import { buildScenarios, generatePerfPoints } from './scenarios.ts'

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

function evaluateScenarios(): (BaselineRow & {
  expected: number
  label: string
})[] {
  return scenarios.map((scenario) => {
    const predicted = currentAlgorithm(scenario.points).map((g) => g.ids)
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
  it.runIf(reportEnabled())('prints a markdown table', () => {
    const rows = evaluateScenarios()
    const cell = (value: number | string): string => String(value)
    const lines = [
      '| Scenario | Expected | Predicted | Edits | B-cubed F1 | Transit single | Pass |',
      '| --- | ---: | ---: | ---: | ---: | ---: | :---: |',
      ...rows
        .map((r) =>
          [
            `${r.id} ${r.label}`,
            cell(r.expected),
            cell(r.groups),
            cell(r.edits),
            r.f1.toFixed(3),
            cell(r.transitSingle),
            r.pass ? 'yes' : 'NO',
          ].join(' | '),
        )
        .map((row) => `| ${row} |`),
    ]
    const canada = evaluateCanada(currentAlgorithm)
    lines.push(
      '',
      'Canada v1: ' +
        [
          `${cell(canada.photos)} grouped photos`,
          `${cell(canada.ungrouped)} ungrouped ignored`,
          `${cell(canada.predictedGroups)} predicted vs ${cell(canada.expectedGroups)} expected groups`,
          `edits ${cell(canada.edits)} (${canada.editsPer100.toFixed(1)} / 100 photos)`,
          `B-cubed F1 ${canada.bcubed.f1.toFixed(3)}`,
        ].join(', '),
      `Failing scenarios: ${cell(rows.filter((r) => !r.pass).length)} / ${cell(rows.length)}`,
    )
    console.info(lines.join('\n'))
    expect(lines.length).toBeGreaterThan(0)
  })
})
