import { describe, expect, it } from 'vitest'
import { buildFlowDays } from '@/features/journey-flow/model/flow-days'
import {
  EMPTY_MARKERS,
  keepCopy,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import {
  buildUnassigned,
  selectedOf,
} from '@/features/journey-flow/model/unassigned'
import {
  at,
  fixtureDay,
  HOTEL,
  ID,
} from '@/features/journey-flow/test-fixtures'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, uuid } from '@/features/journey-workspace/test-fixtures'

const COPY = uuid(900)

function day(markers: FlowMarkers = EMPTY_MARKERS) {
  const { media, moments, placeNames, segments } = fixtureDay()
  // A copy of the first hotel photo: same place, no zone, clock 4 h off.
  const copy = med(900, {
    capturedAt: at('11:10'),
    capturedTz: null,
    latitude: HOTEL.latitude,
    longitude: HOTEL.longitude,
    momentId: null,
  })
  const tree = buildWorkspaceTree(segments, moments, [...media, copy], 'UTC')
  const flow = buildFlowDays({ homeTz: 'UTC', markers, placeNames, tree })
  const found = flow.days.find((d) => d.key === '2026-06-05')
  if (found === undefined) throw new Error('no day')
  return { day: found, media: [...media, copy] }
}

describe('buildUnassigned', () => {
  it('puts unplaced photos on the time axis of the day', () => {
    const model = buildUnassigned(day().day)
    expect(model.axis.from).toBe(at('07:10'))
    expect(model.axis.to).toBe(at('17:00'))
    const points = model.axis.points.map((p) => [p.at, p.noLocation])
    expect(points).toHaveLength(3)
    expect(points[0]?.[1]).toBe(false) // the copy has GPS
    expect(points.slice(1).every((p) => p[1] === true)).toBe(true)
  })

  it('suggests one stop for a group of photos close in time', () => {
    const model = buildUnassigned(day().day)
    const group = model.groups.find((g) => g.mediaIds.length === 2)
    expect(group).toMatchObject({
      agreeing: 2,
      from: at('12:55'),
      reason: 'near_time',
      stopId: ID.lake,
      stopNumber: 3,
      to: at('13:00'),
    })
    // The lake stop began 70 minutes before the group ended.
    expect(group?.offsetMs).toBe(-70 * 60_000)
    expect(
      group === undefined
        ? []
        : selectedOf(group, new Set([group.mediaIds[0] ?? ''])),
    ).toEqual(group?.mediaIds.slice(1))
  })

  it('offers probable copies with the time fix, until kept', () => {
    const { day: flowDay, media } = day()
    const lookup = new Map(media.map((item) => [item.id, item]))
    const model = buildUnassigned(flowDay, lookup)
    expect(model.copies).toHaveLength(1)
    expect(model.copies[0]?.copy.id).toBe(COPY)
    expect(model.copies[0]?.original.capturedAt).toBe(at('07:10'))
    expect(model.copies[0]?.offsetSeconds).toBe(-4 * 3600)

    const kept = day(keepCopy(EMPTY_MARKERS, COPY))
    expect(buildUnassigned(kept.day).copies).toEqual([])
  })
})
