import { describe, expect, it } from 'vitest'
import { buildDaySort } from '@/features/journey-flow/model/day-sort'
import {
  buildSessionView,
  firstOpen,
  locate,
  nextOpen,
  photoState,
  seriesOf,
  sortedIds,
} from '@/features/journey-flow/model/sort-session'
import {
  fixtureDays,
  ID,
  lakeSeries,
} from '@/features/journey-flow/test-fixtures'
import type { SortOutcome } from '@/features/media-batch/model/quick-sort'

function model(mutate?: Parameters<typeof fixtureDays>[0]) {
  const day = fixtureDays(mutate)[0]
  if (day === undefined) throw new Error('no day')
  return buildDaySort(day)
}

const idsOf = (m: ReturnType<typeof model>, stopId: string) =>
  m.stops
    .find((stop) => stop.stop.id === stopId)
    ?.photos.map((photo) => photo.item.id) ?? []

describe('sort session', () => {
  it('counts a photo as decided only when reviewed or decided now', () => {
    const m = model()
    const view = buildSessionView(m, new Map())
    expect(view.totalStops).toBe(5)
    expect(view.doneStops).toBe(1) // the hotel was reviewed before
    expect(view.stops.map((s) => s.number)).toEqual([1, 2, 3, 4, 5])
    expect(firstOpen(view)).toEqual({
      photoId: idsOf(m, ID.ride)[0],
      stopId: ID.ride,
    })
    const [first] = idsOf(m, ID.ride)
    const handled = new Map<string, SortOutcome>([[first ?? '', 'trash']])
    const photo = m.stops[1]?.photos[0]
    if (photo === undefined) throw new Error('no photo')
    expect(photoState(photo, handled)).toBe('trash')
    expect(photoState(photo, new Map())).toBe('open')
  })

  it('advances inside the stop, then to the next stop, wrapping', () => {
    const m = model()
    const lake = idsOf(m, ID.lake)
    const done = new Map<string, SortOutcome>(
      lake.slice(0, 3).map((id) => [id, 'done']),
    )
    const view = buildSessionView(m, done)
    // From the 2nd lake photo the only open one left is the 4th.
    expect(nextOpen(view, { photoId: lake[1] ?? '', stopId: ID.lake })).toEqual(
      { photoId: lake[3], stopId: ID.lake },
    )
    const all = buildSessionView(
      m,
      new Map(lake.map((id) => [id, 'done' as const])),
    )
    // The lake is done: the next stop with open photos (locked pass).
    expect(
      nextOpen(all, { photoId: lake[3] ?? '', stopId: ID.lake })?.stopId,
    ).toBe(ID.locked)
    expect(all.stops.find((s) => s.stop.id === ID.lake)?.done).toBe(true)
    expect(sortedIds(all).has(lake[0] ?? '')).toBe(true)
  })

  it('keeps a photo trashed in this session in its stop (faded, "koš")', () => {
    const m = model()
    const lake = m.stops.find((stop) => stop.stop.id === ID.lake)
    const gone = lake?.photos[0]?.item
    if (lake === undefined || gone === undefined) throw new Error('no lake')
    // The tree no longer has it after the trash.
    const live = {
      ...m,
      stops: m.stops.map((stop) =>
        stop.stop.id === ID.lake
          ? { ...stop, photos: stop.photos.slice(1) }
          : stop,
      ),
    }
    const view = buildSessionView(
      live,
      new Map([[gone.id, 'trash' as const]]),
      [{ item: gone, stopId: ID.lake }],
    )
    const stop = view.stops.find((s) => s.stop.id === ID.lake)
    expect(stop?.photos[0]?.item.id).toBe(gone.id)
    expect(stop?.photos[0]?.state).toBe('trash')
    expect(stop?.total).toBe(4)
    expect(locate(view, { photoId: gone.id, stopId: 'old' })?.index).toBe(0)
    // Undone (not trashed any more): the snapshot is not shown twice.
    expect(
      buildSessionView(live, new Map(), [
        { item: gone, stopId: ID.lake },
      ]).stops.find((s) => s.stop.id === ID.lake)?.total,
    ).toBe(3)
  })

  it('gives the series of a photo without trashed ones', () => {
    const m = model(lakeSeries)
    const lake = idsOf(m, ID.lake)
    const view = buildSessionView(m, new Map())
    expect(seriesOf(view, lake[0] ?? '').map((p) => p.item.id)).toEqual(lake)
    const less = buildSessionView(
      m,
      new Map([[lake[0] ?? '', 'trash' as const]]),
    )
    expect(seriesOf(less, lake[1] ?? '')).toHaveLength(3)
    expect(seriesOf(view, idsOf(m, ID.ride)[0] ?? '')).toEqual([])
  })
})
