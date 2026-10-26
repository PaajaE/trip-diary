import { describe, expect, it } from 'vitest'
import {
  hierarchyDepth,
  isClearStage,
  type DepthStage,
} from './hierarchy-depth.ts'

function days(first: string, count: number): string[] {
  const start = Date.parse(`${first}T00:00:00Z`)
  // Formats synthetic dates, no clock is read.
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  )
}

function stage(
  startsAt: string,
  endsAt: string,
  over: Partial<DepthStage> = {},
): DepthStage {
  return { endsAt, kind: 'stage', origin: 'suggested', startsAt, ...over }
}

const TWO_STAGES = [
  stage('2026-07-01T04:00:00Z', '2026-07-20T04:00:00Z'),
  stage('2026-07-20T04:00:00Z', '2026-09-10T04:00:00Z'),
]

describe('hierarchyDepth', () => {
  it('shows only stops for a one-day journey', () => {
    expect(
      hierarchyDepth({ dayKeys: ['2026-07-01'], stages: TWO_STAGES }),
    ).toMatchObject({ levels: ['stops'], size: 'day', stageMode: 'none' })
    expect(hierarchyDepth({ dayKeys: [], stages: [] }).levels).toEqual([
      'stops',
    ])
  })

  it('shows days and stops for a weekend or a week', () => {
    for (const count of [2, 7, 13]) {
      expect(
        hierarchyDepth({
          dayKeys: days('2026-07-01', count),
          stages: TWO_STAGES,
        }),
      ).toMatchObject({
        levels: ['days', 'stops'],
        size: 'short',
        stageMode: 'none',
      })
    }
  })

  it('offers stages as a suggestion for 2-6 weeks only with two clear stages', () => {
    const dayKeys = days('2026-07-01', 30)
    expect(hierarchyDepth({ dayKeys, stages: TWO_STAGES })).toMatchObject({
      levels: ['days', 'stops'],
      size: 'long',
      stageMode: 'suggestion',
    })
    expect(
      hierarchyDepth({ dayKeys, stages: TWO_STAGES.slice(0, 1) }).stageMode,
    ).toBe('none')
  })

  it('puts stages on top for months, else no stage level', () => {
    const dayKeys = [...days('2026-07-01', 3), '2026-10-15']
    expect(hierarchyDepth({ dayKeys, stages: TWO_STAGES })).toMatchObject({
      levels: ['stages', 'days', 'stops'],
      size: 'grand',
      spanDays: 107,
      stageCount: 2,
      stageMode: 'primary',
    })
    expect(hierarchyDepth({ dayKeys, stages: [] })).toMatchObject({
      levels: ['days', 'stops'],
      stageMode: 'none',
    })
  })

  it('never hides stages the user made or accepted, on any journey size', () => {
    const mine = [
      stage('2026-07-01T04:00:00Z', '2026-07-02T04:00:00Z', {
        origin: 'manual',
      }),
    ]
    for (const count of [1, 5, 30]) {
      expect(
        hierarchyDepth({ dayKeys: days('2026-07-01', count), stages: mine }),
        String(count),
      ).toMatchObject({ stageMode: 'primary' })
    }
    expect(
      hierarchyDepth({ dayKeys: days('2026-07-01', 5), stages: mine }).levels,
    ).toEqual(['stages', 'days', 'stops'])
    expect(
      hierarchyDepth({ dayKeys: ['2026-07-01'], stages: mine }).levels,
    ).toEqual(['stages', 'stops'])
    // a rejected or a trip never brings the level
    expect(
      hierarchyDepth({
        dayKeys: days('2026-07-01', 5),
        stages: [
          stage('2026-07-01T04:00:00Z', '2026-07-02T04:00:00Z', {
            kind: 'trip',
            origin: 'manual',
          }),
        ],
      }).stageMode,
    ).toBe('none')
  })

  it('does not depend on the order of days', () => {
    const dayKeys = days('2026-07-01', 50)
    expect(
      hierarchyDepth({ dayKeys: [...dayKeys].reverse(), stages: TWO_STAGES }),
    ).toEqual(hierarchyDepth({ dayKeys, stages: TWO_STAGES }))
  })
})

describe('isClearStage', () => {
  it('counts manual and accepted stages, never rejected ones or trips', () => {
    const short = ['2026-07-01T04:00:00Z', '2026-07-01T20:00:00Z'] as const
    expect(isClearStage(stage(...short, { origin: 'manual' }))).toBe(true)
    expect(isClearStage(stage(...short, { origin: 'accepted' }))).toBe(true)
    expect(isClearStage(stage(...short, { origin: 'rejected' }))).toBe(false)
    expect(isClearStage(stage(...short, { kind: 'trip' }))).toBe(false)
    // a short proposal is no clear stage
    expect(isClearStage(stage(...short))).toBe(false)
  })

  it('needs a reason when the reason is known', () => {
    const long = ['2026-07-01T04:00:00Z', '2026-07-10T04:00:00Z'] as const
    expect(isClearStage(stage(...long))).toBe(true)
    expect(
      isClearStage(stage(...long, { reason: 'stay: Banff, 5 days' })),
    ).toBe(true)
    expect(isClearStage(stage(...long, { reason: '' }))).toBe(false)
    expect(isClearStage(stage(...long, { reason: null }))).toBe(false)
  })
})
