import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
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
    order: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }
  query.eq.mockReturnValue(query)
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
        eq: vi.fn(() => variants.get(photoId)),
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
    height: 100,
    id: `${photoId}:thumb`,
    kind: 'thumb',
    photoId,
    sizeBytes: blob.size,
    width: 100,
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
})
