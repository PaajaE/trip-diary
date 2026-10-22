import { describe, expect, it } from 'vitest'
import { buildDayStops } from '@/features/journey-workspace/model/day-stops'
import { med, mom } from '@/features/journey-workspace/test-fixtures'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'

function entry(
  n: number,
  startsAt: string,
  endsAt: string,
  over: Parameters<typeof mom>[1] = {},
  media: ReturnType<typeof med>[] = [],
): WorkspaceMoment {
  return {
    cover: null,
    media,
    moment: mom(n, { endsAt, startsAt, ...over }),
    photoCount: media.filter((m) => m.kind === 'photo').length,
    tz: 'Europe/Prague',
    videoCount: media.filter((m) => m.kind === 'video').length,
  }
}

const label = (e: WorkspaceMoment) => e.moment.title

describe('buildDayStops', () => {
  it('merges consecutive moments at the same place within 2 h', () => {
    const stops = buildDayStops(
      [
        entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z', {
          title: 'Lake',
        }),
        entry(2, '2026-06-03T10:00:00Z', '2026-06-03T10:10:00Z', {
          title: 'lake',
        }),
        entry(3, '2026-06-03T13:00:00Z', '2026-06-03T13:10:00Z', {
          title: 'Lake',
        }),
      ],
      label,
    )
    expect(stops.map((s) => s.moments.length)).toEqual([2, 1])
    expect(stops[0]?.endsAt).toBe('2026-06-03T10:10:00Z')
  })

  it('never merges moments without a place label', () => {
    const stops = buildDayStops(
      [
        entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z'),
        entry(2, '2026-06-03T08:40:00Z', '2026-06-03T09:00:00Z'),
      ],
      label,
    )
    expect(stops).toHaveLength(2)
    expect(stops[0]?.title).toBeNull()
  })

  it('keeps each moment and uses the first title; sorts by start', () => {
    const stops = buildDayStops(
      [
        entry(2, '2026-06-03T09:00:00Z', '2026-06-03T09:10:00Z', { body: 'B' }),
        entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z', { body: 'A' }),
      ],
      () => 'Banff',
    )
    expect(stops).toHaveLength(1)
    expect(stops[0]?.moments.map((m) => m.moment.body)).toEqual(['A', 'B'])
    expect(stops[0]?.title).toBe('Banff')
    expect(stops[0]?.id).toBe(stops[0]?.moments[0]?.moment.id)
  })

  it('prefers the first starred photo as hero and sorts media by capture', () => {
    const a = med(11, { capturedAt: '2026-06-03T08:05:00Z' })
    const b = med(12, { capturedAt: '2026-06-03T08:01:00Z', starred: true })
    const [stop] = buildDayStops(
      [entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z', {}, [a, b])],
      label,
    )
    expect(stop?.hero?.id).toBe(b.id)
    expect(stop?.media.map((m) => m.id)).toEqual([b.id, a.id])
    expect(stop?.photoCount).toBe(2)
  })

  it('computes the distance to the next stop from centroids', () => {
    const stops = buildDayStops(
      [
        entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z', {
          latitude: 50,
          longitude: 14,
          title: 'A',
        }),
        entry(2, '2026-06-03T12:00:00Z', '2026-06-03T12:30:00Z', {
          latitude: 50,
          longitude: 15,
          title: 'B',
        }),
        entry(3, '2026-06-03T15:00:00Z', '2026-06-03T15:30:00Z', {
          title: 'C',
        }),
      ],
      label,
    )
    expect(stops[0]?.kmToNext).toBeGreaterThan(70)
    expect(stops[0]?.kmToNext).toBeLessThan(75)
    expect(stops[1]?.kmToNext).toBeNull()
    expect(stops[2]?.kmToNext).toBeNull()
  })

  it('falls back to media coordinates for the centre', () => {
    const [stop] = buildDayStops(
      [
        entry(1, '2026-06-03T08:00:00Z', '2026-06-03T08:30:00Z', {}, [
          med(11, { latitude: 10, longitude: 20 }),
        ]),
      ],
      label,
    )
    expect(stop?.centre).toEqual({ latitude: 10, longitude: 20 })
  })
})
