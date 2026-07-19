import { describe, expect, it } from 'vitest'
import {
  pickCardPhotoVariantPath,
  pickDetailPhotoVariantPath,
} from '@/features/photos/lib/pick-photo-variant-path'
import {
  readMeaningfulPhotoGps,
  readPhotoCoordinate,
} from '@/features/photos/lib/read-photo-coordinate'
import { photoQueryKeys } from '@/features/photos/query-keys'

describe('readPhotoCoordinate', () => {
  it('accepts numeric and numeric-string coordinates', () => {
    expect(readPhotoCoordinate(49.2)).toBe(49.2)
    expect(readPhotoCoordinate('-116.98')).toBe(-116.98)
    expect(readPhotoCoordinate('')).toBeNull()
    expect(readPhotoCoordinate(null)).toBeNull()
  })

  it('rejects null-island but keeps single-axis zeros', () => {
    expect(readMeaningfulPhotoGps(0, 0)).toBeNull()
    expect(readMeaningfulPhotoGps(0, 14.4)).toEqual({
      latitude: 0,
      longitude: 14.4,
    })
  })
})

describe('photo variant fallback', () => {
  it('skips empty paths while falling through preference order', () => {
    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: '  ', variant: 'thumb' },
        { photoId: 'p1', storagePath: 'a/preview.jpg', variant: 'preview' },
      ]),
    ).toBe('a/preview.jpg')

    expect(
      pickDetailPhotoVariantPath([
        { photoId: 'p1', storagePath: '', variant: 'preview' },
        { photoId: 'p1', storagePath: 'a/large.jpg', variant: 'large' },
      ]),
    ).toBe('a/large.jpg')
  })
})

describe('photoQueryKeys', () => {
  it('keeps gallery and cover keys scoped by journey id', () => {
    expect(photoQueryKeys.journeyGallery('j1')).toEqual([
      'journey-gallery',
      'j1',
    ])
    expect(photoQueryKeys.journeyListCover('j1')).toEqual([
      'journey-list-cover',
      'j1',
    ])
    expect(photoQueryKeys.journeyPhotoLocations('j1')).toEqual([
      'journey-photo-locations',
      'j1',
    ])
  })
})
