import { describe, expect, it } from 'vitest'
import {
  buildDayEnd,
  buildDaySort,
  nextOpenPhoto,
  stopToConfirm,
  BLURRY_RELATIVE_MAX,
} from '@/features/journey-flow/model/day-sort'
import { buildFlowDays } from '@/features/journey-flow/model/flow-days'
import { EMPTY_MARKERS } from '@/features/journey-flow/model/flow-markers'
import { at, fixtureDay, ID } from '@/features/journey-flow/test-fixtures'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

function days(
  mutate?: (media: ReturnType<typeof fixtureDay>['media']) => void,
) {
  const { media, moments, placeNames, segments } = fixtureDay()
  mutate?.(media)
  const tree = buildWorkspaceTree(segments, moments, media, 'UTC')
  return buildFlowDays({
    homeTz: 'UTC',
    markers: EMPTY_MARKERS,
    placeNames,
    tree,
  }).days
}

describe('buildDaySort', () => {
  it('shows progress per stop; a photo counts only once reviewed', () => {
    const model = buildDaySort(days()[0] ?? fail())
    expect(model.totalStops).toBe(5)
    expect(model.doneStops).toBe(1) // the hotel: every photo reviewed
    expect(model.currentStopId).toBe(ID.ride)
    expect(model.stops[0]?.reviewed).toBe(5)
    expect(model.unassignedCount).toBe(2)
    // Unsure stops and unplaced photos: no bulk "Den sedí".
    expect(model.daySits).toBe(false)
  })

  it('flags suggested-trash photos with a reason, never removing them', () => {
    const model = buildDaySort(
      days((media) => {
        // The lake photos are a series; one is much less sharp, one is dark.
        media.forEach((item) => {
          if (item.momentId !== ID.lake) return
          item.phash = 0
        })
        const lake = media.filter((item) => item.momentId === ID.lake)
        lake.forEach((item, index) => {
          // A burst: 30 s apart (a series needs gaps <= 90 s).
          item.capturedAt = new Date(
            Date.parse(at('11:50')) + index * 30_000,
          ).toISOString()
          item.quality = { sharp: index === 1 ? 10 : 100, v: 1 }
        })
        const first = lake[0]
        if (first !== undefined)
          first.quality = { exposure: 0.01, sharp: 100, v: 1 }
      })[0] ?? fail(),
    )
    const lake = model.stops.find((stop) => stop.stop.id === ID.lake)
    expect(lake?.photos).toHaveLength(4)
    const hints = lake?.photos.map((photo) => photo.trashHint)
    expect(hints?.[0]).toBe('dark')
    expect(hints?.[1]).toBe('blurry')
    expect(hints?.slice(2)).toEqual([null, null])
    expect(10 / 100).toBeLessThan(BLURRY_RELATIVE_MAX)
    expect(lake?.photos.filter((photo) => photo.recommended)).toHaveLength(1)
    expect(lake?.photos[0]?.seriesIds.length).toBeGreaterThan(1)
  })

  it('walks the open photos and confirms a stop once all are sorted', () => {
    const model = buildDaySort(days()[0] ?? fail())
    const lake = model.stops.find((stop) => stop.stop.id === ID.lake) ?? fail()
    const ids = lake.photos.map((photo) => photo.item.id)
    expect(nextOpenPhoto(lake)).toBe(ids[0])
    expect(nextOpenPhoto(lake, ids[3] ?? null)).toBe(ids[0])
    expect(nextOpenPhoto(lake, ids[0] ?? null, new Set([ids[1] ?? '']))).toBe(
      ids[2],
    )
    expect(stopToConfirm(lake, new Set(ids.slice(0, 3)))).toBeNull()
    expect(stopToConfirm(lake, new Set(ids))).toBe(ID.lake)
    const locked =
      model.stops.find((stop) => stop.stop.id === ID.locked) ?? fail()
    expect(
      stopToConfirm(locked, new Set(locked.photos.map((p) => p.item.id))),
    ).toBeNull()
  })
})

describe('day sort guards', () => {
  it('never suggests a ★ photo for the trash, not even a copy', () => {
    const model = buildDaySort(
      (() => {
        const day = days((media) => {
          const dark = media.find((item) => item.momentId === ID.hotel)
          if (dark !== undefined) {
            dark.starred = true
            dark.quality = { exposure: 0.01, sharp: 1, v: 1 }
          }
        })[0]
        if (day === undefined) return fail()
        const starred = day.media.find((item) => item.starred)
        // Even when it is also flagged as a probable copy.
        return {
          ...day,
          duplicates: [
            { id: starred?.id ?? '', offsetSeconds: 3600, originalId: 'x' },
          ],
        }
      })(),
    )
    const hotel = model.stops.find((stop) => stop.stop.id === ID.hotel)
    const starred = hotel?.photos.find((photo) => photo.item.starred)
    expect(starred?.trashHint).toBeNull()
  })

  it('"Den sedí" only confirms stops that still hold photos', () => {
    const day = days()[0] ?? fail()
    const emptied = {
      ...day,
      stops: day.stops.map((stop) =>
        stop.id === ID.ride ? { ...stop, media: [] } : stop,
      ),
    }
    expect(buildDaySort(emptied).daySitsIds).not.toContain(ID.ride)
  })
})

describe('buildDayEnd', () => {
  it('sums up keep, trash and ★ and proposes the cover from the ★', () => {
    const all = days((media) => {
      const star = media.find((item) => item.capturedAt === at('12:05'))
      if (star !== undefined) star.starred = true
    })
    const summary = buildDayEnd(all[0] ?? fail(), all, 3)
    expect(summary).toMatchObject({
      dayKey: '2026-06-05',
      keep: 17,
      nextDay: null, // the undated group is not a day
      star: 1,
      total: 20,
      trash: 3,
    })
    expect(summary.coverMediaId).not.toBeNull()
    expect(summary.backToStopId).toBe(ID.ride)
  })
})

function fail(): never {
  throw new Error('fixture missing')
}
