import { describe, expect, it } from 'vitest'
import { med } from '@/features/journey-workspace/test-fixtures'
import { bestPhotosOfDay } from './best-of-day-pick'

const day = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    med(i + 1, {
      capturedAt: `2026-06-10T${String(8 + i).padStart(2, '0')}:00:00+00:00`,
      quality: { exposure: 0.5, sharp: 40 + i, v: 1 },
    }),
  )

describe('bestPhotosOfDay', () => {
  it('suggests nothing for a small day', () => {
    expect(bestPhotosOfDay(day(7))).toEqual([])
  })
  it('picks 3-6 photos of a busy day, deterministically', () => {
    const picks = bestPhotosOfDay(day(12))
    expect(picks.length).toBeGreaterThanOrEqual(3)
    expect(picks.length).toBeLessThanOrEqual(6)
    expect(bestPhotosOfDay(day(12)).map((p) => p.id)).toEqual(
      picks.map((p) => p.id),
    )
  })
  it('always keeps a starred photo', () => {
    const media = day(12).map((m, i) => (i === 0 ? { ...m, starred: true } : m))
    expect(bestPhotosOfDay(media).map((p) => p.id)).toContain(media[0]?.id)
  })
})
