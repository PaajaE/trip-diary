import { describe, expect, it } from 'vitest'
import { pickBestOfDay, type DayCandidate } from './best-of-day.ts'

function c(id: string, over: Partial<DayCandidate> = {}): DayCandidate {
  return {
    capturedAt: '2026-06-10T10:00:00Z',
    id,
    kind: 'photo',
    phash: null,
    quality: { exposure: 0.5, sharp: 50, v: 1 },
    starred: false,
    stopId: null,
    ...over,
  }
}

const ids = (cs: DayCandidate[], o = {}) =>
  pickBestOfDay(cs, o).map((p) => p.id)

describe('pickBestOfDay', () => {
  it('always keeps starred photos, even beyond the count', () => {
    const day = ['a', 'b', 'c'].map((id, i) =>
      c(id, { capturedAt: `2026-06-10T1${String(i)}:00:00Z`, starred: true }),
    )
    expect(ids(day, { count: 2 })).toEqual(['a', 'b', 'c'])
  })

  it('prefers the sharper photo and avoids a look-alike of a pick', () => {
    const day = [
      c('sharp', {
        phash: 0b1010,
        quality: { exposure: 0.5, sharp: 90, v: 1 },
      }),
      c('twin', { phash: 0b1011, quality: { exposure: 0.5, sharp: 85, v: 1 } }),
      c('other', {
        phash: 2 ** 49 - 1024,
        quality: { exposure: 0.5, sharp: 60, v: 1 },
      }),
    ]
    expect(ids(day, { count: 2 })).toEqual(['sharp', 'other'])
  })

  it('spreads the picks over the day', () => {
    const day = [
      c('m1', {
        capturedAt: '2026-06-10T08:00:00Z',
        quality: { sharp: 90, v: 1 },
      }),
      c('m2', {
        capturedAt: '2026-06-10T08:10:00Z',
        quality: { sharp: 88, v: 1 },
      }),
      c('noon', {
        capturedAt: '2026-06-10T13:00:00Z',
        quality: { sharp: 70, v: 1 },
      }),
      c('eve', {
        capturedAt: '2026-06-10T20:00:00Z',
        quality: { sharp: 65, v: 1 },
      }),
    ]
    expect(ids(day, { count: 3 }).sort()).toEqual(['eve', 'm1', 'noon'])
  })

  it('takes at most two per stop', () => {
    const day = ['a', 'b', 'c', 'd'].map((id, i) =>
      c(id, { capturedAt: `2026-06-10T10:0${String(i)}:00Z`, stopId: 's1' }),
    )
    expect(ids(day, { count: 4 })).toHaveLength(2)
  })

  it('is deterministic and independent of input order', () => {
    const day = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      c(id, {
        capturedAt: `2026-06-10T${String(8 + i * 2).padStart(2, '0')}:00:00Z`,
        quality: { sharp: 40 + i, v: 1 },
      }),
    )
    expect(ids([...day].reverse())).toEqual(ids(day))
  })

  it('handles an empty day', () => {
    expect(pickBestOfDay([])).toEqual([])
  })
})
