import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEntryPhotoPreviews, getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
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

function createVariantLookup(
  variants: Map<string, ReturnType<typeof createQuery>>,
) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn((_field: string, photoId: string) => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => variants.get(photoId)),
        })),
      })),
      in: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  }
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
    const variants = new Map<string, ReturnType<typeof createQuery>>([
      [
        sharedId,
        createQuery({ data: { storage_path: 'shared' }, error: null }),
      ],
      [
        remoteOnlyId,
        createQuery({ data: { storage_path: 'remote-only' }, error: null }),
      ],
    ])
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'entry_photos' ? links : createVariantLookup(variants),
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
    const usableVariant = createQuery({
      data: { storage_path: 'usable' },
      error: null,
    })
    const brokenVariant = createQuery({
      data: null,
      error: new Error('missing preview'),
    })
    const variants = new Map<string, ReturnType<typeof createQuery>>([
      [usableId, usableVariant],
      [brokenId, brokenVariant],
    ])
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'entry_photos' ? links : createVariantLookup(variants),
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
      { blob: usableBlob, id: usableId },
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
        { photo_id: firstPhotoId, storage_path: 'first' },
        { photo_id: secondPhotoId, storage_path: 'second' },
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
      { blob: firstBlob, id: firstPhotoId },
    ])
    expect(previewsByEntry.get(secondEntryId)).toEqual([
      { blob: secondBlob, id: secondPhotoId },
    ])
  })
})
