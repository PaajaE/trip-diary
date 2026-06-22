import { describe, expect, it } from 'vitest'
import {
  isMeaningfulGpsCoordinate,
  parseNativeExifGps,
} from '@/entities/photo/lib/photo-exif-gps'

describe('parseNativeExifGps', () => {
  it('parses Android EXIF objects with DMS coordinates and refs', () => {
    expect(
      parseNativeExifGps({
        GPSLatitude: '51/1,28/1,48000/1000',
        GPSLatitudeRef: 'N',
        GPSLongitude: '116/1,59/1,42400/1000',
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({
      latitude: 51.480000000000004,
      longitude: -116.99511111111111,
    })
  })

  it('parses JSON strings returned by older Capacitor builds', () => {
    expect(
      parseNativeExifGps(
        JSON.stringify({
          GPSLatitude: '50/1,5/1,0/1',
          GPSLatitudeRef: 'N',
          GPSLongitude: '14/1,26/1,0/1',
          GPSLongitudeRef: 'E',
        }),
      ),
    ).toEqual({
      latitude: 50.083333333333336,
      longitude: 14.433333333333334,
    })
  })
})

describe('isMeaningfulGpsCoordinate', () => {
  it('rejects null island coordinates', () => {
    expect(isMeaningfulGpsCoordinate(0, 0)).toBe(false)
  })

  it('accepts real coordinates', () => {
    expect(isMeaningfulGpsCoordinate(51.263, -116.984)).toBe(true)
  })
})
