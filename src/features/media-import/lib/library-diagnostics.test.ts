import { describe, expect, it } from 'vitest'
import type { MediaLibraryAsset } from '@/shared/lib/media-library'
import { diagnoseAsset, summarizeDiagnostics } from './library-diagnostics'

function asset(overrides: Partial<MediaLibraryAsset> = {}): MediaLibraryAsset {
  return {
    creationDate: '2026-05-21T00:30:00.000Z',
    height: 3024,
    id: 'asset-1',
    isFavorite: false,
    latitude: 51.0447,
    longitude: -114.0719,
    mediaType: 'image',
    sourceType: 'userLibrary',
    subtypes: [],
    width: 4032,
    ...overrides,
  }
}

const calgaryExif = {
  available: true,
  dateTimeOriginal: '2026:05:20 18:30:00',
  gpsLatitude: 51.0447,
  gpsLongitude: -114.0719,
  offsetTimeOriginal: '-06:00',
}

describe('diagnoseAsset', () => {
  it('matches PHAsset fields against embedded EXIF', () => {
    const result = diagnoseAsset(asset(), calgaryExif)

    expect(result.time).toBe('match')
    expect(result.location).toBe('match')
    expect(result.exifOffsetMinutes).toBe(-360)
  })

  it('flags a location that PhotoKit lost', () => {
    const result = diagnoseAsset(
      asset({ latitude: undefined, longitude: undefined }),
      calgaryExif,
    )

    expect(result.location).toBe('mismatch')
    expect(summarizeDiagnostics([result]).locationMissing).toBe(1)
  })

  it('flags a creation date that disagrees with EXIF', () => {
    const result = diagnoseAsset(
      asset({ creationDate: '2026-05-20T18:30:00.000Z' }),
      calgaryExif,
    )

    expect(result.time).toBe('mismatch')
  })

  it('does not compare when EXIF lacks an offset or GPS', () => {
    const result = diagnoseAsset(asset(), {
      available: true,
      dateTimeOriginal: '2026:05:20 18:30:00',
    })

    expect(result.time).toBe('not-comparable')
    expect(result.location).toBe('not-comparable')
  })
})

describe('summarizeDiagnostics', () => {
  it('counts media types, locations and checks', () => {
    const summary = summarizeDiagnostics([
      diagnoseAsset(asset(), calgaryExif),
      diagnoseAsset(
        asset({
          id: 'video',
          latitude: undefined,
          longitude: undefined,
          mediaType: 'video',
        }),
        null,
      ),
    ])

    expect(summary).toMatchObject({
      assets: 2,
      images: 1,
      locationMatches: 1,
      locationMissing: 0,
      timeMatches: 1,
      videos: 1,
      withLocation: 1,
    })
  })
})
