import { describe, expect, it } from 'vitest'
import {
  isMeaningfulGpsCoordinate,
  selectCoverPhotoGps,
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

  it('prefers cover photo GPS over earlier photos', () => {
    expect(
      selectCoverPhotoGps([
        { isCover: false, latitude: 49.2, longitude: 16.6 },
        { isCover: true, latitude: 51.05, longitude: -114.06 },
      ]),
    ).toEqual({ latitude: 51.05, longitude: -114.06 })
  })

  it('rejects null island coordinates', () => {
    expect(isMeaningfulGpsCoordinate(0, 0)).toBe(false)
  })
})
