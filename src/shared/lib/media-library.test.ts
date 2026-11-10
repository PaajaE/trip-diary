import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  deletePhotoExports: vi.fn(),
  deleteThumbnails: vi.fn(),
  exportPhoto: vi.fn(),
  getThumbnails: vi.fn(),
  pickAssets: vi.fn(),
}))
const platform = vi.hoisted(() => ({ current: 'ios' }))
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: (url: string) => url.replace('file://', 'capacitor://'),
    getPlatform: () => platform.current,
    isPluginAvailable: () => true,
  },
  registerPlugin: () => plugin,
}))

import {
  deleteMediaLibraryPhotoExports,
  deleteMediaLibraryThumbnails,
  getMediaLibraryThumbnails,
  exportMediaLibraryPhoto,
  MediaLibraryError,
  pickMediaLibraryAssets,
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
  platform.current = 'ios'
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

describe('pickMediaLibraryAssets', () => {
  const asset = {
    creationDate: '2026-09-11T10:00:00.000Z',
    height: 3,
    id: 'A',
    isFavorite: true,
    mediaType: 'image',
    sourceType: 'userLibrary',
    subtypes: [],
    width: 4,
  }

  it('parses a picked selection', async () => {
    plugin.pickAssets.mockResolvedValue({
      assets: [asset],
      cancelled: false,
      requested: 2,
      resolved: 1,
    })
    const result = await pickMediaLibraryAssets()
    expect(result).toMatchObject({
      cancelled: false,
      requested: 2,
      resolved: 1,
    })
    expect(result.assets[0]?.id).toBe('A')
  })

  it('parses a cancellation', async () => {
    plugin.pickAssets.mockResolvedValue({
      assets: [],
      cancelled: true,
      requested: 0,
      resolved: 0,
    })
    await expect(pickMediaLibraryAssets()).resolves.toMatchObject({
      assets: [],
      cancelled: true,
    })
  })

  it('rejects a malformed result as PICKER_FAILED', async () => {
    plugin.pickAssets.mockResolvedValue({
      assets: [{ id: '' }],
      cancelled: false,
    })
    await expect(pickMediaLibraryAssets()).rejects.toMatchObject({
      code: 'PICKER_FAILED',
    })
  })

  it('keeps the native NOT_AUTHORIZED code', async () => {
    plugin.pickAssets.mockRejectedValue({
      code: 'NOT_AUTHORIZED',
      message: 'no',
    })
    await expect(pickMediaLibraryAssets()).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED',
    })
  })
})

describe('getMediaLibraryThumbnails', () => {
  const nativeFor = (ids: string[]) => ({
    thumbnails: ids.map((id) => ({
      fileUrl: `file:///thumbs/${id}.jpg`,
      height: 192,
      id,
      unavailable: false,
      width: 256,
    })),
  })
  const idsOf = (call: unknown): string[] => (call as { ids: string[] }).ids

  it('converts file urls and sends size with the default', async () => {
    plugin.getThumbnails.mockImplementation((o: { ids: string[] }) =>
      Promise.resolve(nativeFor(o.ids)),
    )
    await expect(getMediaLibraryThumbnails(['a/1'])).resolves.toEqual([
      {
        height: 192,
        id: 'a/1',
        src: 'capacitor:///thumbs/a/1.jpg',
        unavailable: false,
        width: 256,
      },
    ])
    expect(plugin.getThumbnails).toHaveBeenCalledWith({
      ids: ['a/1'],
      size: 256,
    })
  })

  it('forwards size and allowNetwork', async () => {
    plugin.getThumbnails.mockResolvedValue(nativeFor(['a']))
    await getMediaLibraryThumbnails(['a'], { allowNetwork: true, size: 128 })
    expect(plugin.getThumbnails).toHaveBeenCalledWith({
      allowNetwork: true,
      ids: ['a'],
      size: 128,
    })
  })

  it('dedupes ids, chunks by 60 and keeps order', async () => {
    const ids = Array.from({ length: 130 }, (_, i) => `id${String(i)}`)
    plugin.getThumbnails.mockImplementation(
      (o: { ids: string[] }) =>
        // Later chunks answer first to prove order is by position.
        new Promise((resolve) =>
          setTimeout(
            () => {
              resolve(nativeFor([...o.ids].reverse()))
            },
            o.ids[0] === 'id0' ? 10 : 0,
          ),
        ),
    )
    const result = await getMediaLibraryThumbnails([...ids, 'id3', 'id0'])
    expect(plugin.getThumbnails).toHaveBeenCalledTimes(3)
    expect(
      plugin.getThumbnails.mock.calls.map((c) => idsOf(c[0]).length),
    ).toEqual([60, 60, 10])
    expect(result.map((item) => item.id)).toEqual(ids)
  })

  it('runs at most 2 chunks in parallel', async () => {
    let active = 0
    let peak = 0
    plugin.getThumbnails.mockImplementation(async (o: { ids: string[] }) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active--
      return nativeFor(o.ids)
    })
    const ids = Array.from({ length: 300 }, (_, i) => `id${String(i)}`)
    await getMediaLibraryThumbnails(ids)
    expect(plugin.getThumbnails).toHaveBeenCalledTimes(5)
    expect(peak).toBe(2)
  })

  it('passes unavailable assets through and fills missing ones', async () => {
    plugin.getThumbnails.mockResolvedValue({
      thumbnails: [
        { id: 'a', unavailable: true },
        ...nativeFor(['b']).thumbnails,
      ],
    })
    const result = await getMediaLibraryThumbnails(['a', 'b', 'c'])
    expect(result.map((item) => item.unavailable)).toEqual([true, false, true])
  })

  it('does not call native for an empty list', async () => {
    await expect(getMediaLibraryThumbnails([])).resolves.toEqual([])
    expect(plugin.getThumbnails).not.toHaveBeenCalled()
  })

  it('rejects an invalid payload as THUMBNAIL_FAILED', async () => {
    plugin.getThumbnails.mockResolvedValue({
      thumbnails: [{ id: 'a', unavailable: false }],
    })
    await expect(getMediaLibraryThumbnails(['a'])).rejects.toMatchObject({
      code: 'THUMBNAIL_FAILED',
    })
  })

  it('maps NOT_AUTHORIZED to MediaLibraryError', async () => {
    plugin.getThumbnails.mockRejectedValue({
      code: 'NOT_AUTHORIZED',
      message: 'no',
    })
    const error: unknown = await getMediaLibraryThumbnails(['a']).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(MediaLibraryError)
    expect(error).toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('throws an unavailable error on web', async () => {
    platform.current = 'web'
    await expect(getMediaLibraryThumbnails(['a'])).rejects.toBeInstanceOf(
      MediaLibraryError,
    )
    expect(plugin.getThumbnails).not.toHaveBeenCalled()
  })
})

describe('deleteMediaLibraryThumbnails', () => {
  it('deletes given ids or everything', async () => {
    plugin.deleteThumbnails.mockResolvedValue({ deleted: 2 })
    await deleteMediaLibraryThumbnails(['a'])
    expect(plugin.deleteThumbnails).toHaveBeenLastCalledWith({ ids: ['a'] })
    await deleteMediaLibraryThumbnails()
    expect(plugin.deleteThumbnails).toHaveBeenLastCalledWith({})
  })

  it('maps native rejections', async () => {
    plugin.deleteThumbnails.mockRejectedValue({ code: 'NOT_FOUND' })
    await expect(deleteMediaLibraryThumbnails()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
