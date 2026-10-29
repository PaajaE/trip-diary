import { describe, expect, it } from 'vitest'
import {
  boundaryF1,
  dayAssignmentAccuracy,
  duplicatePairScore,
  junkScore,
} from './metrics.ts'
import { formatScorecard, scoreGoldenSet } from './run.ts'
import { scoreFunctions } from './functions.ts'
import { goldenSetSchema } from './golden.ts'
import { syntheticGoldenSets } from './synthetic.ts'

describe('dayAssignmentAccuracy', () => {
  it('counts missing predictions as wrong', () => {
    const score = dayAssignmentAccuracy(
      { a: '2026-06-01', b: '2026-06-02' },
      { a: '2026-06-01', b: '2026-06-01', c: '2026-06-01' },
    )
    expect(score).toEqual({ correct: 1, rate: 1 / 3, total: 3 })
  })

  it('is perfect for an empty truth', () => {
    expect(dayAssignmentAccuracy({}, {}).rate).toBe(1)
  })
})

describe('boundaryF1', () => {
  it('accepts a boundary one day off within tolerance', () => {
    const score = boundaryF1(['2026-07-07'], ['2026-07-06'], 1)
    expect(score).toEqual({ f1: 1, precision: 1, recall: 1 })
  })

  it('rejects a boundary beyond tolerance', () => {
    expect(boundaryF1(['2026-07-09'], ['2026-07-06'], 1).f1).toBe(0)
  })

  it('matches each true boundary only once', () => {
    const score = boundaryF1(['2026-07-06', '2026-07-07'], ['2026-07-06'], 1)
    expect(score.precision).toBe(0.5)
    expect(score.recall).toBe(1)
  })
})

describe('duplicatePairScore', () => {
  it('scores pairs, so a merged extra photo lowers precision', () => {
    const { precision, recall } = duplicatePairScore(
      [['a', 'b', 'c']],
      [['a', 'b']],
    )
    expect(precision).toEqual({ correct: 1, rate: 1 / 3, total: 3 })
    expect(recall.rate).toBe(1)
  })
})

describe('junkScore', () => {
  it('counts wanted photos that were flagged against all photos', () => {
    const { falsePositiveRate, recall } = junkScore(['a', 'x'], ['a', 'b'], 100)
    expect(falsePositiveRate).toEqual({ correct: 1, rate: 0.01, total: 100 })
    expect(recall.rate).toBe(0.5)
  })

  it('has no false positives when nothing is flagged', () => {
    expect(junkScore([], ['a'], 10).falsePositiveRate.rate).toBe(0)
  })
})

describe('scorecard on synthetic sets', () => {
  const sets = syntheticGoldenSets()

  it('produces sets that satisfy the golden schema', () => {
    for (const set of sets) {
      expect(goldenSetSchema.safeParse(set).success).toBe(true)
    }
  })

  it('is deterministic', () => {
    expect(sets.map(scoreGoldenSet)).toEqual(sets.map(scoreGoldenSet))
  })

  it('formats one row per set', () => {
    const text = formatScorecard(sets.map(scoreGoldenSet))
    expect(text.split('\n')).toHaveLength(sets.length + 1)
  })
})

describe('function scenarios (wave 2)', () => {
  it('pass completely', () => {
    for (const score of scoreFunctions()) {
      expect(score.passed, score.name).toBe(score.total)
      expect(score.total, score.name).toBeGreaterThan(0)
    }
  })
})
