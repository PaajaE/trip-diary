import { describe, expect, it } from 'vitest'
import {
  isMeaningfulGpsCoordinate,
  selectFirstPhotoGps,
} from '@/features/journeys/lib/photo-gps'

describe('photo-gps', () => {
  it('selects the first photo with meaningful coordinates', () => {
    expect(
      selectFirstPhotoGps([
        { latitude: null, longitude: null },
        { latitude: 49.2, longitude: 16.6 },
        { latitude: 50.1, longitude: 14.4 },
      ]),
    ).toEqual({ latitude: 49.2, longitude: 16.6 })
  })

  it('rejects null island coordinates', () => {
    expect(isMeaningfulGpsCoordinate(0, 0)).toBe(false)
  })
})
