import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  deletePhotoExports: vi.fn(),
  exportPhoto: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', isPluginAvailable: () => true },
  registerPlugin: () => plugin,
}))

import {
  deleteMediaLibraryPhotoExports,
  exportMediaLibraryPhoto,
  MediaLibraryError,
} from '@/shared/lib/media-library'

const good = {
  byteSize: 10,
  fileUrl: 'file:///tmp/a.jpg',
  hasExif: true,
  height: 2,
  mimeType: 'image/jpeg',
  width: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exportMediaLibraryPhoto', () => {
  it('passes the options through and parses the result', async () => {
    plugin.exportPhoto.mockResolvedValue(good)
    await expect(
      exportMediaLibraryPhoto({
        allowNetwork: false,
        id: 'A',
        maxLongEdge: 2000,
      }),
    ).resolves.toEqual(good)
    expect(plugin.exportPhoto).toHaveBeenCalledWith({
      allowNetwork: false,
      id: 'A',
      maxLongEdge: 2000,
    })
  })

  it('rejects a malformed native result as EXPORT_FAILED', async () => {
    plugin.exportPhoto.mockResolvedValue({ ...good, mimeType: 'image/png' })
    await expect(exportMediaLibraryPhoto({ id: 'A' })).rejects.toMatchObject({
      code: 'EXPORT_FAILED',
    })
  })

  it.each([
    'NOT_AUTHORIZED',
    'NOT_FOUND',
    'ASSET_UNAVAILABLE',
    'EXPORT_FAILED',
  ])('maps native code %s to a typed error', async (code) => {
    plugin.exportPhoto.mockRejectedValue({ code, message: 'native' })
    const error: unknown = await exportMediaLibraryPhoto({ id: 'A' }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(MediaLibraryError)
    expect(error).toMatchObject({ code, message: 'native' })
  })

  it('maps unknown rejections to UNKNOWN', async () => {
    plugin.exportPhoto.mockRejectedValue(new Error('weird'))
    await expect(exportMediaLibraryPhoto({ id: 'A' })).rejects.toMatchObject({
      code: 'UNKNOWN',
    })
  })
})

describe('deleteMediaLibraryPhotoExports', () => {
  it('calls the native delete with the file urls', async () => {
    plugin.deletePhotoExports.mockResolvedValue({ deleted: 1 })
    await deleteMediaLibraryPhotoExports(['file:///a'])
    expect(plugin.deletePhotoExports).toHaveBeenCalledWith({
      fileUrls: ['file:///a'],
    })
  })
})
