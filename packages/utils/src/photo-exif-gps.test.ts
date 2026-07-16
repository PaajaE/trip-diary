import { describe, expect, it } from 'vitest'
import {
  getMeaningfulGpsCoordinates,
  isMeaningfulGpsCoordinate,
  parseNativeExifGps,
} from './photo-exif-gps.ts'

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

  it('applies western hemisphere to numeric Expo ImagePicker EXIF', () => {
    expect(
      parseNativeExifGps({
        GPSLatitude: 51.0452,
        GPSLatitudeRef: 'N',
        GPSLongitude: 114.062972166667,
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({
      latitude: 51.0452,
      longitude: -114.062972166667,
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

  it('keeps southern and western hemispheres distinct across photos', () => {
    const first = parseNativeExifGps({
      GPSLatitude: 33.87,
      GPSLatitudeRef: 'S',
      GPSLongitude: 151.21,
      GPSLongitudeRef: 'E',
    })
    const second = parseNativeExifGps({
      GPSLatitude: 51.05,
      GPSLatitudeRef: 'N',
      GPSLongitude: 114.06,
      GPSLongitudeRef: 'W',
    })

    expect(first).toEqual({ latitude: -33.87, longitude: 151.21 })
    expect(second).toEqual({ latitude: 51.05, longitude: -114.06 })
  })
})

describe('isMeaningfulGpsCoordinate', () => {
  it('rejects null island coordinates', () => {
    expect(isMeaningfulGpsCoordinate(0, 0)).toBe(false)
    expect(getMeaningfulGpsCoordinates(0, 0)).toBeNull()
  })

  it('accepts real coordinates', () => {
    expect(isMeaningfulGpsCoordinate(51.263, -116.984)).toBe(true)
  })
})
