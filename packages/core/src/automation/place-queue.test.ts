import { describe, expect, it } from 'vitest'
import {
  placeCellKey,
  planPlaceLookups,
  runLimited,
  type PlaceLookupStop,
} from './place-queue.ts'

function stop(
  id: string,
  startsAt: string,
  latitude: number,
  longitude: number,
  dayKey?: string,
): PlaceLookupStop {
  return {
    ...(dayKey === undefined ? {} : { dayKey }),
    id,
    latitude,
    longitude,
    startsAt,
  }
}

describe('placeCellKey', () => {
  it('puts positions a few hundred metres apart into one ~1 km cell', () => {
    expect(placeCellKey(51.1784, -115.5708)).toBe(
      placeCellKey(51.1786, -115.5712),
    )
    // ~2 km north is another cell
    expect(placeCellKey(51.1784, -115.5708)).not.toBe(
      placeCellKey(51.1964, -115.5708),
    )
  })

  it('keys depend on the cell size', () => {
    expect(placeCellKey(50, 14, 500)).not.toBe(placeCellKey(50, 14, 1000))
  })
})

describe('planPlaceLookups', () => {
  const stops = [
    stop('d1a', '2026-09-01T16:00:00Z', 51.1784, -115.5708, '2026-09-01'),
    stop('d1b', '2026-09-01T17:00:00Z', 51.1786, -115.5712, '2026-09-01'),
    stop('d2', '2026-09-02T16:00:00Z', 51.4254, -116.1773, '2026-09-02'),
    stop('d3', '2026-09-03T16:00:00Z', 50.2, -116.0, '2026-09-03'),
  ]

  it('looks a cell up once and orders the most recent day first', () => {
    const batches = planPlaceLookups(stops)
    expect(batches).toHaveLength(1)
    expect(batches[0]?.map((cell) => cell.momentIds)).toEqual([
      ['d3'],
      ['d2'],
      ['d1a', 'd1b'],
    ])
    // the oldest stop's position is looked up
    expect(batches[0]?.[2]).toMatchObject({
      latitude: 51.1784,
      longitude: -115.5708,
    })
  })

  it('puts the visible day first', () => {
    const batches = planPlaceLookups(stops, { focusDayKey: '2026-09-01' })
    expect(batches.flat().map((cell) => cell.momentIds[0])).toEqual([
      'd1a',
      'd3',
      'd2',
    ])
  })

  it('splits cells into batches and is order independent', () => {
    const batches = planPlaceLookups(stops, { batchSize: 2 })
    expect(batches.map((batch) => batch.length)).toEqual([2, 1])
    expect(planPlaceLookups([...stops].reverse(), { batchSize: 2 })).toEqual(
      batches,
    )
  })

  it('derives the 04:00 day from the zone at the position', () => {
    // 09:30Z = 03:30 MDT: still the day before
    const [batch] = planPlaceLookups([
      stop('n', '2026-09-02T09:30:00Z', 51.1784, -115.5708),
    ])
    expect(batch?.[0]?.dayKey).toBe('2026-09-01')
  })

  it('skips invalid positions and returns nothing for no stops', () => {
    expect(planPlaceLookups([])).toEqual([])
    expect(
      planPlaceLookups([stop('x', '2026-09-01T10:00:00Z', 200, 0)]),
    ).toEqual([])
  })
})

describe('runLimited', () => {
  it('never runs more than the limit at once and keeps the order', async () => {
    let running = 0
    let peak = 0
    const tasks = [30, 10, 20, 5].map((delay, index) => async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, delay))
      running -= 1
      if (index === 2) throw new Error('boom')
      return index
    })
    const results = await runLimited(tasks, 2)
    expect(peak).toBe(2)
    expect(results.map((r) => (r?.ok === true ? r.value : 'err'))).toEqual([
      0,
      1,
      'err',
      3,
    ])
  })

  it('stops starting tasks once stopped', async () => {
    let started = 0
    let stop = false
    const tasks = [1, 2, 3].map(() => async () => {
      started += 1
      stop = true
      await Promise.resolve()
      return started
    })
    const results = await runLimited(tasks, 1, () => stop)
    expect(started).toBe(1)
    expect(results.filter((r) => r === null)).toHaveLength(2)
  })
})
