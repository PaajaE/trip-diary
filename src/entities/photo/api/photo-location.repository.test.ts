import { afterEach, describe, expect, it, vi } from 'vitest'
import { getJourneyPhotoLocations } from '@/entities/photo/api/photo-location.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { isBrowserOnline } from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))
vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => true),
}))

describe('getJourneyPhotoLocations', () => {
  afterEach(async () => {
    await localDb.photos.clear()
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(isBrowserOnline).mockReturnValue(true)
  })

  it('merges local and remote photo coordinates by photo id', async () => {
    const entryId = crypto.randomUUID()
    const localPhotoId = crypto.randomUUID()
    const remotePhotoId = crypto.randomUUID()

    await localDb.photos.put({
      capturedAt: null,
      createdAt: new Date().toISOString(),
      creatorId: crypto.randomUUID(),
      entryId,
      id: localPhotoId,
      latitude: 50.08,
      longitude: 14.43,
      position: 0,
      syncStatus: 'pending',
    })

    const from = vi.fn((table: string) => {
      if (table === 'entry_photos') {
        return {
          in: vi.fn().mockResolvedValue({
            data: [{ entry_id: entryId, photo_id: remotePhotoId }],
            error: null,
          }),
          select: vi.fn().mockReturnThis(),
        }
      }

      return {
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: remotePhotoId,
              latitude: 48.2,
              longitude: 16.37,
            },
          ],
          error: null,
        }),
        select: vi.fn().mockReturnThis(),
      }
    })

    vi.mocked(getSupabaseClient).mockReturnValue({
      from,
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await expect(
      getJourneyPhotoLocations([
        { entry: { id: entryId, title: 'Prague morning' } },
      ]),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId,
          id: localPhotoId,
          latitude: 50.08,
          longitude: 14.43,
        }),
        expect.objectContaining({
          entryId,
          id: remotePhotoId,
          latitude: 48.2,
          longitude: 16.37,
        }),
      ]),
    )
  })

  it('returns local photo coordinates when remote fetch fails', async () => {
    const entryId = crypto.randomUUID()
    const localPhotoId = crypto.randomUUID()

    await localDb.photos.put({
      capturedAt: null,
      createdAt: new Date().toISOString(),
      creatorId: crypto.randomUUID(),
      entryId,
      id: localPhotoId,
      latitude: 50.08,
      longitude: 14.43,
      position: 0,
      syncStatus: 'pending',
    })

    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({
          data: null,
          error: new Error('offline'),
        }),
        select: vi.fn().mockReturnThis(),
      }),
    } as unknown as ReturnType<typeof getSupabaseClient>)

    await expect(
      getJourneyPhotoLocations([
        { entry: { id: entryId, title: 'Prague morning' } },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        entryId,
        id: localPhotoId,
        latitude: 50.08,
        longitude: 14.43,
      }),
    ])
  })

  it('skips remote fetch while offline', async () => {
    const entryId = crypto.randomUUID()
    const localPhotoId = crypto.randomUUID()

    vi.mocked(isBrowserOnline).mockReturnValue(false)

    await localDb.photos.put({
      capturedAt: null,
      createdAt: new Date().toISOString(),
      creatorId: crypto.randomUUID(),
      entryId,
      id: localPhotoId,
      latitude: 48.2,
      longitude: 16.37,
      position: 0,
      syncStatus: 'pending',
    })

    await expect(
      getJourneyPhotoLocations([
        { entry: { id: entryId, title: 'Vienna evening' } },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        entryId,
        id: localPhotoId,
        latitude: 48.2,
        longitude: 16.37,
      }),
    ])
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })
})
