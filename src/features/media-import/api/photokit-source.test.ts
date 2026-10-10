import { describe, expect, it, vi } from 'vitest'
import {
  createPhotoKitSource,
  MAX_IMPORT_VIDEO_MS,
} from '@/features/media-import/api/photokit-source'
import { dayRange } from '@/features/media-import/model/range'
import type { MediaLibraryAsset } from '@/shared/lib/media-library'

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: (url: string) => url,
    getPlatform: () => 'ios',
    isPluginAvailable: () => true,
  },
  registerPlugin: () => ({}),
}))

function asset(over: Partial<MediaLibraryAsset>): MediaLibraryAsset {
  return {
    creationDate: '2026-09-11T10:00:00.000Z',
    height: 3,
    id: 'A',
    isFavorite: false,
    mediaType: 'image',
    sourceType: 'userLibrary',
    subtypes: [],
    width: 4,
    ...over,
  }
}

describe('PhotoKit source', () => {
  it('maps assets to candidates and flags long videos', async () => {
    const source = createPhotoKitSource({
      listAssets: () =>
        Promise.resolve([
          asset({ id: 'p', latitude: 50.08, longitude: 14.42 }),
          asset({ durationMs: 12_000, id: 'v', mediaType: 'video' }),
          asset({
            durationMs: MAX_IMPORT_VIDEO_MS + 1,
            id: 'long',
            mediaType: 'video',
          }),
          asset({
            durationMs: MAX_IMPORT_VIDEO_MS,
            id: 'edge',
            mediaType: 'video',
          }),
          asset({ id: 'audio', mediaType: 'audio' }),
        ]),
    })
    const list = await source.list()
    expect(list.map((c) => [c.sourceId, c.mediaType, c.skipReason])).toEqual([
      ['p', 'photo', undefined],
      ['v', 'video', undefined],
      ['long', 'video', 'video_too_long'],
      ['edge', 'video', undefined],
    ])
    expect(list[0]).toMatchObject({
      capturedAt: '2026-09-11T10:00:00.000Z',
      latitude: 50.08,
      longitude: 14.42,
    })
    expect(list[1]).toMatchObject({ durationMs: 12_000 })
  })

  it('filters by a Europe/Prague day range', async () => {
    const source = createPhotoKitSource({
      listAssets: () =>
        Promise.resolve([
          // 00:30 local on 11 Sep (Prague, +02:00) = 22:30Z on the 10th.
          asset({ creationDate: '2026-09-10T22:30:00.000Z', id: 'in' }),
          asset({ creationDate: '2026-09-10T21:30:00.000Z', id: 'out' }),
          asset({ creationDate: undefined, id: 'undated' }),
        ]),
    })
    const list = await source.list(
      dayRange('2026-09-11', '2026-09-11', 'Europe/Prague'),
    )
    expect(list.map((c) => [c.sourceId, c.skipReason])).toEqual([
      ['in', undefined],
      ['undated', 'no_capture_time'],
    ])
  })

  it('exports a photo to a File and removes the export on cleanup', async () => {
    const exportPhoto = vi.fn(() =>
      Promise.resolve({
        byteSize: 3,
        fileUrl: 'file:///tmp/x.jpg',
        hasExif: true,
        height: 2,
        mimeType: 'image/jpeg' as const,
        width: 2,
      }),
    )
    const deleteExports = vi.fn(() => Promise.resolve())
    const source = createPhotoKitSource({
      allowNetwork: true,
      deleteExports,
      exportPhoto,
      maxLongEdge: 3000,
      readFile: () => Promise.resolve(new Blob(['abc'])),
    })
    const opened = await source.open({
      capturedAt: null,
      durationMs: null,
      latitude: null,
      longitude: null,
      mediaType: 'photo',
      sourceId: 'PH-1',
    })
    expect(exportPhoto).toHaveBeenCalledWith({
      allowNetwork: true,
      id: 'PH-1',
      maxLongEdge: 3000,
    })
    expect(opened.file.type).toBe('image/jpeg')
    expect(opened.file.size).toBe(3)
    expect(deleteExports).not.toHaveBeenCalled()
    await opened.cleanup()
    expect(deleteExports).toHaveBeenCalledWith(['file:///tmp/x.jpg'])
  })

  it('defaults to no iCloud download and deletes the export when reading fails', async () => {
    const exportPhoto = vi.fn(() =>
      Promise.resolve({
        byteSize: 3,
        fileUrl: 'file:///tmp/y.jpg',
        hasExif: false,
        height: 2,
        mimeType: 'image/jpeg' as const,
        width: 2,
      }),
    )
    const deleteExports = vi.fn(() => Promise.resolve())
    const source = createPhotoKitSource({
      deleteExports,
      exportPhoto,
      readFile: () => Promise.reject(new Error('boom')),
    })
    const candidate = {
      capturedAt: null,
      durationMs: null,
      latitude: null,
      longitude: null,
      mediaType: 'photo' as const,
      sourceId: 'PH-2',
    }
    await expect(source.open(candidate)).rejects.toThrow('boom')
    expect(exportPhoto).toHaveBeenCalledWith({
      allowNetwork: false,
      id: 'PH-2',
    })
    expect(deleteExports).toHaveBeenCalledWith(['file:///tmp/y.jpg'])
    await expect(
      source.open({ ...candidate, mediaType: 'video' }),
    ).rejects.toThrow('uploadVideo')
  })
})
