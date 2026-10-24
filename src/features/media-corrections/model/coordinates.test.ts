import { describe, expect, it } from 'vitest'
import {
  firstPosition,
  formatCoordinate,
  parseCoordinates,
} from '@/features/media-corrections/model/coordinates'

describe('parseCoordinates', () => {
  it('accepts a decimal point or comma and trims', () => {
    expect(parseCoordinates(' 50,0875 ', '14.42')).toEqual({
      latitude: 50.0875,
      longitude: 14.42,
    })
    expect(parseCoordinates('-33.9', '-180')).toEqual({
      latitude: -33.9,
      longitude: -180,
    })
  })

  it('rejects empty, non-numeric and out-of-range input', () => {
    expect(parseCoordinates('', '14')).toBeNull()
    expect(parseCoordinates('abc', '14')).toBeNull()
    expect(parseCoordinates('1e2', '14')).toBeNull()
    expect(parseCoordinates('90.1', '14')).toBeNull()
    expect(parseCoordinates('10', '180.5')).toBeNull()
  })
})

describe('helpers', () => {
  it('formats with six decimals', () => {
    expect(formatCoordinate(50.1)).toBe('50.100000')
  })

  it('finds the first positioned item', () => {
    expect(
      firstPosition([
        { latitude: null, longitude: null },
        { latitude: 1, longitude: 2 },
        { latitude: 3, longitude: 4 },
      ]),
    ).toEqual({ latitude: 1, longitude: 2 })
    expect(firstPosition([{ latitude: null, longitude: null }])).toBeNull()
  })
})
