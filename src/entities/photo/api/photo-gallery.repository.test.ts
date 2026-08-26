import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getEntryPhotoPreviews,
  getJourneyEntryPhotoCardPreviews,
  getJourneyEntryPhotoPreviews,
} from '@/entities/photo/api/photo-gallery.repository'
import type {
  LocalPhoto,
  LocalPhotoVariant,
} from '@/entities/photo/model/photo'
import { localDb } from '@/shared/lib/local-db'

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
}))

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: getSupabaseClientMock,
}))

interface QueryResult {
  data: unknown
  error: Error | null
}

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.select.mockReturnValue(query)
  query.single.mockResolvedValue(result)
  return query
}

function createLocalPhoto(
  id: string,
  entryId: string,
  position: number,
): LocalPhoto {
  return {
    capturedAt: null,
    createdAt: new Date().toISOString(),
    creatorId: crypto.randomUUID(),
    entryId,
    id,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    position,
    syncStatus: 'pending',
  }
}

function createThumb(photoId: string, blob: Blob): LocalPhotoVariant {
  return {
    blob,
    createdAt: new Date().toISOString(),
    ext: 'jpg',
    height: 100,
    id: `${photoId}:thumb`,
    kind: 'thumb',
    mimeType: 'image/jpeg',
    photoId,
    sizeBytes: blob.size,
    width: 100,
  }
}

function createFull(photoId: string, blob: Blob): LocalPhotoVariant {
  return {
    ...createThumb(photoId, blob),
    id: `${photoId}:full`,
    kind: 'full',
  }
}

/** Legacy preview row — still accepted as full fallback. */
function createPreview(photoId: string, blob: Blob): LocalPhotoVariant {
  return {
    ...createThumb(photoId, blob),
    id: `${photoId}:preview`,
    kind: 'preview',
  }
}

describe('getEntryPhotoPreviews', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
  })

  afterEach(async () => {
    await localDb.photos.clear()
    await localDb.photoVariants.clear()
  })

  it('merges local and remote previews by photo ID without hiding remote photos', async () => {
    const entryId = crypto.randomUUID()
    const sharedId = crypto.randomUUID()
    const remoteOnlyId = crypto.randomUUID()
    const localOnlyId = crypto.randomUUID()
    const localSharedBlob = new Blob(['local shared'])
    const localOnlyBlob = new Blob(['local only'])
    const remoteOnlyBlob = new Blob(['remote only'])
    const remoteSharedBlob = new Blob(['remote shared'])

    await localDb.photos.bulkAdd([
      createLocalPhoto(sharedId, entryId, 0),
      createLocalPhoto(localOnlyId, entryId, 2),
    ])
    await localDb.photoVariants.bulkAdd([
      createThumb(sharedId, localSharedBlob),
      createThumb(localOnlyId, localOnlyBlob),
    ])

    const links = createQuery({
      data: [
        { photo_id: sharedId, position: 0 },
        { photo_id: remoteOnlyId, position: 1 },
      ],
      error: null,
    })
    const variants = createQuery({
      data: [
        {
          height: 100,
          photo_id: sharedId,
          storage_path: 'shared',
          variant: 'thumb',
          width: 100,
        },
        {
          height: 100,
          photo_id: remoteOnlyId,
          storage_path: 'remote-only',
          variant: 'thumb',
          width: 100,
        },
      ],
      error: null,
    })
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'entry_photos' ? links : variants,
      ),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn((path: string) =>
            Promise.resolve({
              data: path === 'remote-only' ? remoteOnlyBlob : remoteSharedBlob,
              error: null,
            }),
          ),
        })),
      },
    })

    const previews = await getEntryPhotoPreviews(entryId)

    expect(previews.map(({ id }) => id)).toEqual([
      sharedId,
      remoteOnlyId,
      localOnlyId,
    ])
    expect(previews[0]?.blob).not.toBe(remoteSharedBlob)
  })

  it('keeps remote cover selection when local still treats position 0 as cover', async () => {
    const entryId = crypto.randomUUID()
    const firstId = crypto.randomUUID()
    const coverId = crypto.randomUUID()
    const firstBlob = new Blob(['local first'])
    const coverBlob = new Blob(['local cover'])
    const remoteFirstBlob = new Blob(['remote first'])
    const remoteCoverBlob = new Blob(['remote cover'])

    await localDb.photos.bulkAdd([
      createLocalPhoto(firstId, entryId, 0),
      createLocalPhoto(coverId, entryId, 1),
    ])
    await localDb.photoVariants.bulkAdd([
      createThumb(firstId, firstBlob),
      createThumb(coverId, coverBlob),
    ])

    const links = createQuery({
      data: [
        { photo_id: firstId, position: 0, is_cover: false },
        { photo_id: coverId, position: 1, is_cover: true },
      ],
      error: null,
    })
    const variants = createQuery({
      data: [
        {
          height: 100,
          photo_id: firstId,
          storage_path: 'first',
          variant: 'thumb',
          width: 100,
        },
        {
          height: 100,
          photo_id: coverId,
          storage_path: 'cover',
          variant: 'thumb',
          width: 100,
        },
      ],
      error: null,
    })
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'entry_photos' ? links : variants,
      ),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn((path: string) =>
            Promise.resolve({
              data: path === 'cover' ? remoteCoverBlob : remoteFirstBlob,
              error: null,
            }),
          ),
        })),
      },
    })

    const previews = await getEntryPhotoPreviews(entryId)

    expect(previews.map(({ id, isCover }) => ({ id, isCover }))).toEqual([
      { id: coverId, isCover: true },
      { id: firstId, isCover: false },
    ])
    expect(previews[0]?.blob).not.toBe(remoteCoverBlob)
  })

  it('keeps usable previews when one remote preview is broken', async () => {
    const entryId = crypto.randomUUID()
    const usableId = crypto.randomUUID()
    const brokenId = crypto.randomUUID()
    const usableBlob = new Blob(['usable'])
    const links = createQuery({
      data: [
        { photo_id: usableId, position: 0 },
        { photo_id: brokenId, position: 1 },
      ],
      error: null,
    })
    const variants = createQuery({
      data: [
        {
          height: 100,
          photo_id: usableId,
          storage_path: 'usable',
          variant: 'thumb',
          width: 100,
        },
      ],
      error: null,
    })
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'entry_photos' ? links : variants,
      ),
      storage: {
        from: vi.fn(() => ({
          download: vi
            .fn()
            .mockResolvedValue({ data: usableBlob, error: null }),
        })),
      },
    })

    await expect(getEntryPhotoPreviews(entryId)).resolves.toEqual([
      { blob: usableBlob, height: 100, id: usableId, width: 100 },
    ])
  })

  it('uses another local display variant when the thumbnail is missing', async () => {
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const blob = new Blob(['preview'])
    await localDb.photos.add(createLocalPhoto(photoId, entryId, 0))
    await localDb.photoVariants.add(createPreview(photoId, blob))
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => createQuery({ data: [], error: null })),
    })

    const previews = await getEntryPhotoPreviews(entryId)
    expect(previews.map(({ id }) => id)).toEqual([photoId])
  })

  it('falls back from legacy preview when full is preferred for detail', async () => {
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const blob = new Blob(['full-legacy'])
    await localDb.photos.add(createLocalPhoto(photoId, entryId, 0))
    await localDb.photoVariants.add(createFull(photoId, blob))
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => createQuery({ data: [], error: null })),
    })

    const previews = await getEntryPhotoPreviews(entryId)
    expect(previews.map(({ id }) => id)).toEqual([photoId])
  })

  it('does not download video variant for grid previews', async () => {
    const entryId = crypto.randomUUID()
    const videoPhotoId = crypto.randomUUID()
    const thumbBlob = new Blob(['thumb'])
    const links = createQuery({
      data: [{ photo_id: videoPhotoId, position: 0 }],
      error: null,
    })
    const variants = createQuery({
      data: [
        {
          height: 1080,
          photo_id: videoPhotoId,
          storage_path: 'video-path',
          variant: 'video',
          width: 1920,
        },
        {
          height: 220,
          photo_id: videoPhotoId,
          storage_path: 'thumb-path',
          variant: 'thumb',
          width: 220,
        },
      ],
      error: null,
    })
    const photosMeta = createQuery({
      data: [
        {
          duration_ms: 5000,
          id: videoPhotoId,
          media_type: 'video',
        },
      ],
      error: null,
    })
    const download = vi.fn((path: string) =>
      Promise.resolve({
        data: path === 'thumb-path' ? thumbBlob : new Blob(['video']),
        error: null,
      }),
    )
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'entry_photos') {
          return links
        }
        if (table === 'photos') {
          return photosMeta
        }
        return variants
      }),
      storage: {
        from: vi.fn(() => ({ download })),
      },
    })

    const previews = await getEntryPhotoPreviews(entryId)

    expect(variants.in).toHaveBeenCalledWith(
      'variant',
      expect.not.arrayContaining(['video']),
    )
    expect(download).toHaveBeenCalledWith('thumb-path')
    expect(download).not.toHaveBeenCalledWith('video-path')
    expect(previews).toEqual([
      {
        blob: thumbBlob,
        durationMs: 5000,
        height: 220,
        id: videoPhotoId,
        mediaType: 'video',
        width: 220,
      },
    ])
  })
})

describe('getJourneyEntryPhotoPreviews', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
  })

  afterEach(async () => {
    await localDb.photos.clear()
    await localDb.photoVariants.clear()
  })

  it('loads previews for multiple entries in one batch', async () => {
    const firstEntryId = crypto.randomUUID()
    const secondEntryId = crypto.randomUUID()
    const firstPhotoId = crypto.randomUUID()
    const secondPhotoId = crypto.randomUUID()
    const firstBlob = new Blob(['first'])
    const secondBlob = new Blob(['second'])

    const links = createQuery({
      data: [
        { entry_id: firstEntryId, photo_id: firstPhotoId, position: 0 },
        { entry_id: secondEntryId, photo_id: secondPhotoId, position: 0 },
      ],
      error: null,
    })
    const variants = createQuery({
      data: [
        {
          height: 800,
          photo_id: firstPhotoId,
          storage_path: 'first',
          variant: 'preview',
          width: 800,
        },
        {
          height: 220,
          photo_id: secondPhotoId,
          storage_path: 'second',
          variant: 'thumb',
          width: 220,
        },
      ],
      error: null,
    })
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'entry_photos') {
          return links
        }
        return variants
      }),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn((path: string) =>
            Promise.resolve({
              data: path === 'first' ? firstBlob : secondBlob,
              error: null,
            }),
          ),
        })),
      },
    })

    const { failedEntryIds, previewsByEntry } =
      await getJourneyEntryPhotoPreviews([firstEntryId, secondEntryId])

    expect(failedEntryIds.size).toBe(0)
    expect(previewsByEntry.get(firstEntryId)).toEqual([
      { blob: firstBlob, height: 800, id: firstPhotoId, width: 800 },
    ])
    expect(previewsByEntry.get(secondEntryId)).toEqual([
      { blob: secondBlob, height: 220, id: secondPhotoId, width: 220 },
    ])
  })
})

describe('getJourneyEntryPhotoCardPreviews', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
  })

  afterEach(async () => {
    await localDb.photos.clear()
    await localDb.photoVariants.clear()
  })

  it('prefers small over thumb and medium for card context', async () => {
    const entryId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const smallBlob = new Blob(['small'])

    const links = createQuery({
      data: [{ entry_id: entryId, photo_id: photoId, position: 0 }],
      error: null,
    })
    const variants = createQuery({
      data: [
        {
          height: 220,
          photo_id: photoId,
          storage_path: 'thumb-path',
          variant: 'thumb',
          width: 220,
        },
        {
          height: 800,
          photo_id: photoId,
          storage_path: 'small-path',
          variant: 'small',
          width: 800,
        },
        {
          height: 1600,
          photo_id: photoId,
          storage_path: 'medium-path',
          variant: 'medium',
          width: 1600,
        },
      ],
      error: null,
    })
    const download = vi.fn((path: string) =>
      Promise.resolve({
        data: path === 'small-path' ? smallBlob : new Blob(['other']),
        error: null,
      }),
    )
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'entry_photos') {
          return links
        }
        return variants
      }),
      storage: {
        from: vi.fn(() => ({ download })),
      },
    })

    const { failedEntryIds, previewsByEntry } =
      await getJourneyEntryPhotoCardPreviews([entryId])

    expect(failedEntryIds.size).toBe(0)
    expect(download).toHaveBeenCalledWith('small-path')
    expect(download).not.toHaveBeenCalledWith('medium-path')
    expect(previewsByEntry.get(entryId)).toEqual([
      { blob: smallBlob, height: 800, id: photoId, width: 800 },
    ])
  })
})
