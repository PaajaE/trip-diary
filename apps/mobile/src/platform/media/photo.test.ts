import { beforeEach, describe, expect, it, vi } from 'vitest'

const manipulateResize = vi.fn().mockReturnThis()
const saveAsync = vi.fn(async () => ({
  height: 1920,
  uri: 'file:///mock/documents/photos/converted.jpg',
  width: 2560,
}))
const renderAsync = vi.fn(async () => ({
  height: 1920,
  saveAsync,
  width: 2560,
}))

vi.mock('expo-file-system', () => ({
  EncodingType: { Base64: 'base64' },
  copyAsync: vi.fn(async () => {}),
  deleteAsync: vi.fn(async () => {}),
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1024 })),
  makeDirectoryAsync: vi.fn(async () => {}),
  readAsStringAsync: vi.fn(async () => '/9j/4AAQ'),
}))

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: vi.fn(() => ({
      resize: manipulateResize,
      renderAsync,
    })),
  },
  SaveFormat: { JPEG: 'jpeg' },
}))

vi.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: {
    Compatible: 'compatible',
  },
  UIImagePickerPresentationStyle: {
    FULL_SCREEN: 'fullScreen',
  },
  VideoExportPreset: {
    H264_1920x1080: 'H264_1920x1080',
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

vi.mock('@/platform/media/video', () => ({
  isVideoPickerAsset: vi.fn(() => false),
  materializePickedVideoAssetSafe: vi.fn(),
}))

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}))

import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import {
  extractPhotoMetadata,
  materializePickedAssetSafe,
  persistPhotoLocally,
  pickPhotos,
} from './photo'

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

describe('materializePickedAssetSafe', () => {
  beforeEach(() => {
    manipulateResize.mockClear()
    saveAsync.mockClear()
    renderAsync.mockClear()
    vi.mocked(FileSystem.copyAsync).mockResolvedValue(undefined)
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 2048,
      uri: 'file:///mock',
    } as never)
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue('/9j/AAAA')
  })

  it('always runs ImageManipulator resize for JPEG camera assets', async () => {
    const result = await materializePickedAssetSafe({
      exif: null,
      height: 3024,
      mimeType: 'image/jpeg',
      uri: 'file:///tmp/camera.jpg',
      width: 4032,
    })

    expect(result.status).toBe('ready')
    expect(manipulateResize).toHaveBeenCalled()
    expect(result.width).toBe(2560)
    expect(result.height).toBe(1920)
  })

  it('returns a failed item instead of throwing when copy fails', async () => {
    vi.mocked(FileSystem.copyAsync).mockRejectedValueOnce(
      new Error('Could not copy the selected photo'),
    )

    const result = await materializePickedAssetSafe({
      exif: null,
      height: 100,
      mimeType: 'image/jpeg',
      uri: 'ph://asset-1',
      width: 100,
    })

    expect(result.status).toBe('failed')
    expect(result.diagnostics.failedStage).toBe('copy')
    expect(result.diagnostics.sourceUriScheme).toBe('ph')
    expect(result.diagnostics.lastError).toContain('Could not copy')
  })
})

describe('pickPhotos batch isolation', () => {
  it('keeps successful assets when one materialize fails', async () => {
    let copyCount = 0
    vi.mocked(FileSystem.copyAsync).mockImplementation(async () => {
      copyCount += 1
      if (copyCount === 1) {
        throw new Error('iCloud asset unavailable')
      }
    })
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 2048,
      uri: 'file:///mock',
    } as never)
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValue('/9j/AAAA')
    vi.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      assets: [
        {
          height: 100,
          mimeType: 'image/jpeg',
          uri: 'ph://bad',
          width: 100,
        },
        {
          height: 1500,
          mimeType: 'image/jpeg',
          uri: 'file:///good.jpg',
          width: 2000,
        },
      ],
      canceled: false,
    } as never)

    const result = await pickPhotos()

    expect(result.photos).toHaveLength(2)
    expect(result.photos[0]?.status).toBe('failed')
    expect(result.photos[1]?.status).toBe('ready')
  })
})
