import { describe, expect, it } from 'vitest'
import { buildFlowDays } from '@/features/journey-flow/model/flow-days'
import {
  acknowledgeArrivals,
  addRun,
  EMPTY_MARKERS,
} from '@/features/journey-flow/model/flow-markers'
import { buildIntake, isNewDay } from '@/features/journey-flow/model/intake'
import { fixtureDay, ID } from '@/features/journey-flow/test-fixtures'

function days(markers = EMPTY_MARKERS) {
  const { placeNames, tree } = fixtureDay()
  return buildFlowDays({ homeTz: 'UTC', markers, placeNames, tree }).days
}

describe('buildIntake', () => {
  it('gives plain facts per new day', () => {
    const markers = addRun(EMPTY_MARKERS, 'r', [ID.viewpoint])
    const model = buildIntake(days(markers), markers)
    expect(model.days).toHaveLength(1) // the undated group is not a day
    const day = model.days[0]
    expect(day).toMatchObject({
      key: '2026-06-05',
      needsLookCount: 1,
      photoCount: 17,
      sortedStops: 1,
      stopCount: 4,
      tripCount: 1,
      videoCount: 0,
    })
    expect(day?.places).toEqual([
      expect.objectContaining({
        base: { kind: 'place', text: 'Hotel, Jasper' },
      }),
      expect.objectContaining({
        base: { kind: 'title', text: 'Maligne Lake' },
      }),
    ])
    expect(day?.coverMediaId).not.toBeNull()
    expect(model.totals).toEqual({
      days: 1,
      lookStops: 1,
      newMedia: day?.newMediaCount,
      sureStops: 3,
    })
  })

  it('shows only days with arrivals after the seen marker', () => {
    // Everything of the fixture is older than this, except the lake photos.
    const seen = acknowledgeArrivals(EMPTY_MARKERS, '2026-06-05T20:30:00+00:00')
    const all = days(seen)
    const day = all.find((d) => d.key === '2026-06-05')
    expect(day !== undefined && isNewDay(day, seen)).toBe(true)
    const model = buildIntake(all, seen)
    expect(model.days[0]?.newMediaCount).toBe(4)

    const later = acknowledgeArrivals(
      EMPTY_MARKERS,
      '2026-06-06T00:00:00+00:00',
    )
    expect(buildIntake(days(later), later).days).toEqual([])
  })

  it('orders the least sure days first', () => {
    const markers = addRun(EMPTY_MARKERS, 'r', [ID.viewpoint])
    const model = buildIntake(days(markers), markers)
    expect(model.byConfidence).toEqual(['2026-06-05'])
  })
})
