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
    // The locked stop is confirmed, not "vypadá jistě"; the undated photo
    // has its own bucket (and counts as new).
    expect(model.totals).toEqual({
      confirmedStops: 1,
      days: 1,
      lookStops: 1,
      newMedia: (day?.newMediaCount ?? 0) + 1,
      sureStops: 2,
    })
    expect(day?.confirmedCount).toBe(1)
    expect(model.unknownTime).toEqual({ mediaCount: 1, newMediaCount: 1 })
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

  it('counts sorted stops among the same stops as stopCount (rides excluded)', () => {
    const { placeNames, tree } = fixtureDay()
    for (const entry of tree.looseMoments) {
      if (entry.moment.id !== ID.ride) continue
      entry.media = entry.media.map((item) => ({
        ...item,
        reviewedAt: '2026-06-06T08:00:00+00:00',
      }))
    }
    const markers = addRun(EMPTY_MARKERS, 'r', [ID.viewpoint])
    const flowDays = buildFlowDays({
      homeTz: 'UTC',
      markers,
      placeNames,
      tree,
    }).days
    const day = buildIntake(flowDays, markers).days[0]
    expect(day?.sortedStops).toBe(1) // the hotel; the sorted ride does not count
    expect(day?.stopCount).toBe(4)
  })
})
