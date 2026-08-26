import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateThumbnailsAsync, pause } = vi.hoisted(() => ({
  generateThumbnailsAsync: vi.fn(async () => [
    {
      height: 1080,
      width: 1920,
    },
  ]),
  pause: vi.fn(),
}))

vi.mock('expo-file-system', () => ({
  EncodingType: { Base64: 'base64' },
  copyAsync: vi.fn(async () => {}),
  deleteAsync: vi.fn(async () => {}),
  documentDirectory: 'file:///mock/documents/',
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1024 })),
  makeDirectoryAsync: vi.fn(async () => {}),
  readAsStringAsync: vi.fn(async () => {
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ])
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return globalThis.atob(binary)
  }),
}))

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: vi.fn(() => ({
      renderAsync: vi.fn(async () => ({
        saveAsync: vi.fn(async () => ({
          height: 1080,
          uri: 'file:///mock/documents/photos/temp-poster.jpg',
          width: 1920,
        })),
      })),
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
  getMediaLibraryPermissionsAsync: vi.fn(async () => ({
    accessPrivileges: 'all',
    granted: true,
    status: 'granted',
  })),
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}))

vi.mock('expo-video', () => ({
  createVideoPlayer: vi.fn(() => ({
    generateThumbnailsAsync,
    pause,
  })),
}))

vi.mock('@/platform/media/photo', () => ({
  extractPhotoMetadata: vi.fn(async (uri: string) => ({
    capturedAt: null,
    latitude: null,
    localUri: uri,
    longitude: null,
  })),
  generateSmallJpeg: vi.fn(async (_uri: string, localId: string) => ({
    height: 800,
    uri: `file:///mock/documents/photos/${localId}-small.jpg`,
    width: 800,
  })),
  generateThumbJpeg: vi.fn(async (_uri: string, localId: string) => ({
    height: 220,
    uri: `file:///mock/documents/photos/${localId}-thumb.jpg`,
    width: 220,
  })),
  getLocalFileByteSize: vi.fn(async () => 1024),
}))

import * as FileSystem from 'expo-file-system'
import { isVideoPickerAsset, materializePickedVideoAssetSafe } from './video'

describe('video picker materialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(FileSystem.readAsStringAsync).mockImplementation(async () => {
      const bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ])
      let binary = ''
      for (const byte of bytes) {
        binary += String.fromCharCode(byte)
      }
      return globalThis.btoa(binary)
    })
  })

  it('detects video picker assets by type and mime', () => {
    expect(
      isVideoPickerAsset({
        uri: 'file:///clip.mov',
        type: 'video',
      } as never),
    ).toBe(true)
    expect(
      isVideoPickerAsset({
        mimeType: 'video/quicktime',
        uri: 'file:///clip.mov',
      } as never),
    ).toBe(true)
    expect(
      isVideoPickerAsset({
        mimeType: 'image/jpeg',
        uri: 'file:///photo.jpg',
        type: 'image',
      } as never),
    ).toBe(false)
  })

  it('materializes valid MP4 clips with poster variants', async () => {
    const result = await materializePickedVideoAssetSafe({
      duration: 12_000,
      height: 1080,
      mimeType: 'video/mp4',
      type: 'video',
      uri: 'file:///picker/export.mp4',
      width: 1920,
    } as never)

    expect(result.status).toBe('ready')
    expect(result.mediaType).toBe('video')
    expect(result.mimeType).toBe('video/mp4')
    expect(result.durationMs).toBe(12_000)
    expect(result.uri).toMatch(/\.mp4$/)
    expect(result.thumbUri).toContain('-thumb.jpg')
    expect(result.smallUri).toContain('-small.jpg')
    expect(generateThumbnailsAsync).toHaveBeenCalledWith(0.5)
    expect(pause).toHaveBeenCalled()
  })

  it('fails when the copied file is not MP4', async () => {
    vi.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce(
      globalThis.btoa('not-an-mp4-file'),
    )

    const result = await materializePickedVideoAssetSafe({
      duration: 5_000,
      mimeType: 'video/quicktime',
      type: 'video',
      uri: 'file:///picker/export.mov',
      width: 1280,
    } as never)

    expect(result.status).toBe('failed')
    expect(result.diagnostics.failedStage).toBe('validate')
    expect(result.diagnostics.lastError).toContain('not a valid MP4')
  })
})
