import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('expo-file-system', () => ({
  copyAsync: vi.fn(async () => {}),
  documentDirectory: 'file:///mock/documents/',
  makeDirectoryAsync: vi.fn(async () => {}),
}))

vi.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: {
    Compatible: 'compatible',
  },
  UIImagePickerPresentationStyle: {
    FULL_SCREEN: 'fullScreen',
  },
  getCameraPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: 'granted',
  })),
  getMediaLibraryPermissionsAsync: vi.fn(async () => ({
    accessPrivileges: 'all',
    granted: true,
    status: 'granted',
  })),
  launchImageLibraryAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}))

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}))

import * as FileSystem from 'expo-file-system'
import { extractPhotoMetadata, persistPhotoLocally } from './photo'

describe('extractPhotoMetadata', () => {
  it('returns null timestamp and coordinates when exif is absent', async () => {
    const metadata = await extractPhotoMetadata('file:///photo.jpg', null)

    expect(metadata).toEqual({
      capturedAt: null,
      latitude: null,
      localUri: 'file:///photo.jpg',
      longitude: null,
    })
  })

  it('reads DateTimeOriginal from exif', async () => {
    const metadata = await extractPhotoMetadata('file:///photo.jpg', {
      DateTimeOriginal: '2026:07:10 14:30:00',
      GPSLatitude: 50.0755,
      GPSLongitude: 14.4378,
    })

    expect(metadata).toEqual({
      capturedAt: '2026:07:10 14:30:00',
      latitude: 50.0755,
      localUri: 'file:///photo.jpg',
      longitude: 14.4378,
    })
  })

  it('applies western hemisphere reference from Expo EXIF', async () => {
    const metadata = await extractPhotoMetadata('file:///calgary.jpg', {
      GPSLatitude: 51.0452,
      GPSLatitudeRef: 'N',
      GPSLongitude: 114.062972166667,
      GPSLongitudeRef: 'W',
    })

    expect(metadata.latitude).toBe(51.0452)
    expect(metadata.longitude).toBe(-114.062972166667)
  })

  it('rejects null-island coordinates', async () => {
    const metadata = await extractPhotoMetadata('file:///photo.jpg', {
      GPSLatitude: 0,
      GPSLongitude: 0,
    })

    expect(metadata.latitude).toBeNull()
    expect(metadata.longitude).toBeNull()
  })

  it('falls back to DateTime and lowercase dateTimeOriginal', async () => {
    await expect(
      extractPhotoMetadata('file:///a.jpg', {
        DateTime: '2026:07:09 10:00:00',
      }),
    ).resolves.toMatchObject({ capturedAt: '2026:07:09 10:00:00' })

    await expect(
      extractPhotoMetadata('file:///b.jpg', {
        dateTimeOriginal: '2026:07:08 08:00:00',
      }),
    ).resolves.toMatchObject({ capturedAt: '2026:07:08 08:00:00' })
  })

  it('reads GPS coordinates from lowercase exif keys', async () => {
    const metadata = await extractPhotoMetadata('file:///photo.jpg', {
      latitude: 48.8566,
      longitude: 2.3522,
    })

    expect(metadata.latitude).toBe(48.8566)
    expect(metadata.longitude).toBe(2.3522)
  })
})

describe('persistPhotoLocally', () => {
  beforeEach(() => {
    vi.mocked(FileSystem.makeDirectoryAsync).mockClear()
    vi.mocked(FileSystem.copyAsync).mockClear()
  })

  it('creates the photos directory and copies the source file', async () => {
    const destination = await persistPhotoLocally(
      'file:///cache/picked.jpg',
      'picked.jpg',
    )

    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      'file:///mock/documents/photos',
      { intermediates: true },
    )
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///cache/picked.jpg',
      to: 'file:///mock/documents/photos/picked.jpg',
    })
    expect(destination).toBe('file:///mock/documents/photos/picked.jpg')
  })
})
