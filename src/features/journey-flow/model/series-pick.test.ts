import { describe, expect, it } from 'vitest'
import { buildDaySort } from '@/features/journey-flow/model/day-sort'
import {
  initialKeep,
  seriesNote,
  seriesOutcome,
  seriesStates,
  toggleKeep,
} from '@/features/journey-flow/model/series-pick'
import {
  buildSessionView,
  seriesOf,
} from '@/features/journey-flow/model/sort-session'
import {
  fixtureDays,
  ID,
  lakeSeries,
} from '@/features/journey-flow/test-fixtures'
import { relativeSharpness } from '@/features/media-batch/model/series'

function lake() {
  const day = fixtureDays(lakeSeries)[0]
  if (day === undefined) throw new Error('no day')
  const view = buildSessionView(buildDaySort(day), new Map())
  const first = view.stops.find((s) => s.stop.id === ID.lake)?.photos[0]
  return seriesOf(view, first?.item.id ?? '')
}

describe('series pick', () => {
  it('pre-selects the recommended shot; the rest goes to the trash', () => {
    const series = lake()
    expect(series).toHaveLength(4)
    const keep = initialKeep(series)
    const best = series[1]?.item.id ?? ''
    expect([...keep]).toEqual([best])
    expect(seriesOutcome(series, keep)).toEqual({
      keepIds: [best],
      trashIds: series.map((p) => p.item.id).filter((id) => id !== best),
    })
    // "Nechávám 2 ze 4": flip one more to keep.
    const more = toggleKeep(keep, series[2]?.item.id ?? '')
    expect(seriesOutcome(series, more).keepIds).toHaveLength(2)
    expect(toggleKeep(more, best).has(best)).toBe(false)
  })

  it('keeps the user’s own ★ photos too', () => {
    const series = lake().map((photo, index) =>
      index === 3
        ? { ...photo, item: { ...photo.item, starred: true } }
        : photo,
    )
    expect(initialKeep(series).size).toBe(2)
  })

  it('notes why a photo is not the recommended one', () => {
    const series = lake()
    const sharp = relativeSharpness(series.map((p) => p.item))
    expect(series.map((p) => seriesNote(p, sharp))).toEqual([
      'blurry',
      'recommended',
      null,
      null,
    ])
    const last = series[3]
    if (last === undefined) throw new Error('no photo')
    expect(seriesNote(last, new Map(sharp).set(last.item.id, 0.5))).toBe(
      'lessSharp',
    )
  })

  it('lets every photo come to the compare: not kept is still open', () => {
    const series = lake()
    const states = seriesStates(series, initialKeep(series))
    expect([...states.values()]).toEqual(['open', 'keep', 'open', 'open'])
  })
})
