import { describe, expect, it } from 'vitest'
import {
  COVER_FOCAL_CENTER,
  coverObjectPosition,
  normalizeCoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'

describe('cover-focal-point', () => {
  it('returns null for missing coordinates', () => {
    expect(normalizeCoverFocalPoint(null, null)).toBeNull()
    expect(normalizeCoverFocalPoint(0.2, null)).toBeNull()
  })

  it('clamps coordinates into 0..1', () => {
    expect(normalizeCoverFocalPoint(1.4, -0.2)).toEqual({ x: 1, y: 0 })
  })

  it('uses center fallback when focal is absent', () => {
    expect(coverObjectPosition(null)).toBe('50% 50%')
    expect(coverObjectPosition(COVER_FOCAL_CENTER)).toBe('50% 50%')
  })

  it('formats custom focal as percentages', () => {
    expect(coverObjectPosition({ x: 0.25, y: 0.75 })).toBe('25% 75%')
  })
})
