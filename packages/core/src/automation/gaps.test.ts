import { describe, expect, it } from 'vitest'
import {
  classifyGap,
  refineWithNeighbours,
  type GapClass,
  type GapFeatures,
} from './gaps.ts'

const MIN = 60_000

function features(
  distanceKm: number,
  minutes: number,
  extra: Partial<GapFeatures> = {},
): GapFeatures {
  return {
    altitudeChangeM: null,
    distanceM: distanceKm * 1000,
    durationMs: minutes * MIN,
    environment: null,
    next: null,
    previous: null,
    ...extra,
  }
}

describe('classifyGap', () => {
  it('tells walking, cycling and driving apart by speed', () => {
    expect(classifyGap(features(0.4, 6)).mode).toBe('walk')
    expect(classifyGap(features(5, 15)).mode).toBe('bike')
    expect(classifyGap(features(30, 20)).mode).toBe('vehicle')
    for (const gap of [features(0.4, 6), features(5, 15), features(30, 20)]) {
      expect(classifyGap(gap).confidence).toBeGreaterThan(0.7)
    }
  })

  it('gives no mode when nothing moved', () => {
    const gap = classifyGap(features(0.05, 30))
    expect(gap.mode).toBe('transit')
    expect(gap.confidence).toBe(0)
  })

  it('does not call a car with a photo after 2 hours a ride', () => {
    // 40 km in 2 h = 20 km/h would be cycling pace, but the gap is long.
    const gap = classifyGap(features(40, 120))
    expect(gap.mode).toBe('transit')
    // ... while a long gap at a speed only a vehicle reaches stays a vehicle.
    expect(classifyGap(features(150, 120)).mode).toBe('vehicle')
  })

  it('does not call slow wandering over a long gap a walk', () => {
    expect(classifyGap(features(2, 240)).mode).toBe('transit')
  })

  it('uses climbing and nature for slow movement', () => {
    const climb = classifyGap(
      features(1.2, 70, { altitudeChangeM: 350, environment: 'nature' }),
    )
    expect(climb.mode).toBe('walk')
    expect(climb.confidence).toBeGreaterThan(
      classifyGap(features(1.2, 70)).confidence,
    )
  })

  it('has a short English reason', () => {
    expect(classifyGap(features(30, 20)).reason).toMatch(/^vehicle: /)
  })
})

describe('refineWithNeighbours', () => {
  const vehicle = (): GapClass => classifyGap(features(60, 40))

  it('reads a slow stretch between vehicle segments as traffic', () => {
    const jam = features(6, 30, { next: vehicle(), previous: vehicle() })
    const own = classifyGap(jam)
    expect(own.mode).toBe('bike')
    const refined = refineWithNeighbours(jam, own)
    expect(refined.mode).toBe('vehicle')
    expect(refined.reason).toMatch(/traffic/)
  })

  it('leaves the same stretch a ride when the neighbours are not vehicles', () => {
    const ride = classifyGap(features(5, 15))
    const lone = features(6, 30, { next: ride, previous: ride })
    expect(refineWithNeighbours(lone, classifyGap(lone)).mode).toBe('bike')
  })

  it('lets an unclear segment continue two equal neighbours', () => {
    const walk = classifyGap(features(0.4, 6))
    const unclear = features(40, 120, { next: walk, previous: walk })
    const own = classifyGap(unclear)
    expect(own.mode).toBe('transit')
    expect(refineWithNeighbours(unclear, own).mode).toBe('walk')
  })
})
