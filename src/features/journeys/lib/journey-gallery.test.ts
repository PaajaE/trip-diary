import { describe, expect, it, vi } from 'vitest'
import {
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
} from '@/features/journeys/lib/journey-gallery'

describe('mergeJourneyGalleryPhotos', () => {
  it('merges photos into one collection and keeps their moment assignment', () => {
    const firstEntryId = crypto.randomUUID()
    const secondEntryId = crypto.randomUUID()
    const firstPhotoId = crypto.randomUUID()
    const firstBlob = new Blob(['lake'])

    const photos = mergeJourneyGalleryPhotos(
      [
        { entry: { id: firstEntryId, title: 'Lake' } },
        { entry: { id: secondEntryId, title: null } },
      ],
      [
        [{ blob: firstBlob, id: firstPhotoId }],
        [],
        [{ blob: new Blob(['ignored']), id: crypto.randomUUID() }],
      ],
    )

    expect(photos).toEqual([
      {
        blob: firstBlob,
        entryId: firstEntryId,
        entryTitle: 'Lake',
        id: firstPhotoId,
      },
    ])
  })

  it('keeps successful moment previews when another moment fails', async () => {
    const firstEntryId = crypto.randomUUID()
    const secondEntryId = crypto.randomUUID()
    const preview = { blob: new Blob(['lake']), id: crypto.randomUUID() }
    const loadPreviews = vi
      .fn<(entryId: string) => Promise<(typeof preview)[]>>()
      .mockResolvedValueOnce([preview])
      .mockRejectedValueOnce(new Error('offline'))

    await expect(
      loadJourneyGalleryPreviews(
        [
          { entry: { id: firstEntryId, title: 'Lake' } },
          { entry: { id: secondEntryId, title: 'Camp' } },
        ],
        loadPreviews,
      ),
    ).resolves.toEqual({
      failedMomentCount: 1,
      previewsByMoment: [[preview], undefined],
    })
  })
})
