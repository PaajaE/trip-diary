import { describe, expect, it } from 'vitest'
import {
  applyFlowMarkers,
  buildFlowBase,
  buildFlowDays,
} from '@/features/journey-flow/model/flow-days'
import {
  acknowledgeArrivals,
  addRun,
  EMPTY_MARKERS,
} from '@/features/journey-flow/model/flow-markers'
import { fixtureDay, ID } from '@/features/journey-flow/test-fixtures'
import { UNKNOWN_DAY } from '@/features/journey-workspace/model/workspace-days'

function flow(markers = addRun(EMPTY_MARKERS, 'r1', [ID.viewpoint])) {
  const { placeNames, tree } = fixtureDay()
  return buildFlowDays({ homeTz: 'UTC', markers, placeNames, tree })
}

describe('buildFlowDays', () => {
  it('lists the stops of a day in time order with derived names', () => {
    const { days } = flow()
    const day = days.find((d) => d.key === '2026-06-05')
    expect(day?.stops.map((s) => s.id)).toEqual([
      ID.hotel,
      ID.ride,
      ID.viewpoint,
      ID.lake,
      ID.locked,
    ])
    const [hotel, ride, viewpoint, lake, locked] = day?.stops ?? []
    expect(hotel?.name.base).toEqual({ kind: 'place', text: 'Hotel, Jasper' })
    expect(ride?.kind).toBe('en_route')
    // A stop with GPS and no place yet: skeleton, never "Zastávka 10:42".
    expect(viewpoint?.name.base).toEqual({ kind: 'pending' })
    // No stored position: the place job cannot look it up, so time of day.
    expect(lake?.name.base.kind).toBe('dayPart')
    expect(locked?.name.base).toEqual({ kind: 'title', text: 'Maligne Lake' })
    expect(locked?.locked).toBe(true)
    expect(locked?.confidence.level).toBe('confirmed')
  })

  it('marks "nová" and what deserves a look', () => {
    const day = flow().days[0]
    const byId = new Map(day?.stops.map((s) => [s.id, s]))
    expect(byId.get(ID.viewpoint)?.isNew).toBe(true)
    expect(byId.get(ID.viewpoint)?.needsLook).toBe(true)
    // A lone photo is a valid point: it needs a look only because it is new
    // and its place is not known yet, not because of its count.
    expect(byId.get(ID.viewpoint)?.confidence).toEqual({
      level: 'high',
      reasons: [],
    })
    const seen = flow(EMPTY_MARKERS).days[0]?.stops.find(
      (stop) => stop.id === ID.viewpoint,
    )
    expect(seen?.needsLook).toBe(false)
    expect(byId.get(ID.hotel)?.needsLook).toBe(false)
    expect(byId.get(ID.ride)?.needsLook).toBe(false)
    expect(byId.get(ID.locked)?.needsLook).toBe(false)
  })

  it('puts trips of the day with their stops, unplaced photos by day', () => {
    const { days } = flow()
    const day = days.find((d) => d.key === '2026-06-05')
    expect(day?.trips).toEqual([
      expect.objectContaining({
        id: ID.trip,
        stopIds: [ID.viewpoint, ID.lake],
        tripType: 'walk',
      }),
    ])
    expect(day?.unassigned).toHaveLength(2)
    expect(days[days.length - 1]?.key).toBe(UNKNOWN_DAY)
    expect(days[days.length - 1]?.unassigned).toHaveLength(1)
  })

  it('is deterministic', () => {
    const markers = acknowledgeArrivals(EMPTY_MARKERS, null)
    expect(JSON.stringify(flow(markers))).toBe(JSON.stringify(flow(markers)))
  })

  it('re-applies markers without rebuilding the heavy part', () => {
    const { placeNames, tree } = fixtureDay()
    const base = buildFlowBase({ homeTz: 'UTC', placeNames, tree })
    const a = applyFlowMarkers(base, EMPTY_MARKERS)
    const b = applyFlowMarkers(base, addRun(EMPTY_MARKERS, 'r', [ID.viewpoint]))
    // Same day objects underneath (no second copy detection or naming).
    expect(a.days[0]?.stops[0]?.entry).toBe(b.days[0]?.stops[0]?.entry)
    expect(a.days[0]?.stops[0]?.name).toBe(b.days[0]?.stops[0]?.name)
    expect(b.days[0]?.stops.find((s) => s.id === ID.viewpoint)?.isNew).toBe(
      true,
    )
  })
})
