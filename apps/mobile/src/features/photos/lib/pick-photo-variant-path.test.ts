import { describe, expect, it } from 'vitest'
import {
  groupVariantsByPhotoId,
  pickCardPhotoVariantPath,
  pickDetailPhotoVariantPath,
} from '@/features/photos/lib/pick-photo-variant-path'

describe('pickPhotoVariantPath', () => {
  it('prefers thumb for cards, then preview, then large', () => {
    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/large.jpg', variant: 'large' },
        { photoId: 'p1', storagePath: 'a/preview.jpg', variant: 'preview' },
        { photoId: 'p1', storagePath: 'a/thumb.jpg', variant: 'thumb' },
      ]),
    ).toBe('a/thumb.jpg')

    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/large.jpg', variant: 'large' },
        { photoId: 'p1', storagePath: 'a/preview.jpg', variant: 'preview' },
      ]),
    ).toBe('a/preview.jpg')

    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/large.jpg', variant: 'large' },
      ]),
    ).toBe('a/large.jpg')
  })

  it('prefers preview for detail, falling back to large then thumb', () => {
    expect(
      pickDetailPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/thumb.jpg', variant: 'thumb' },
        { photoId: 'p1', storagePath: 'a/preview.jpg', variant: 'preview' },
      ]),
    ).toBe('a/preview.jpg')

    expect(
      pickDetailPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/thumb.jpg', variant: 'thumb' },
      ]),
    ).toBe('a/thumb.jpg')
  })

  it('groups remote variant rows by photo id', () => {
    const grouped = groupVariantsByPhotoId([
      { photo_id: 'p1', storage_path: 'a/thumb.jpg', variant: 'thumb' },
      { photo_id: 'p2', storage_path: 'b/preview.jpg', variant: 'preview' },
      { photo_id: 'p1', storage_path: 'a/preview.jpg', variant: 'preview' },
    ])

    expect(grouped.get('p1')).toHaveLength(2)
    expect(pickCardPhotoVariantPath(grouped.get('p1') ?? [])).toBe(
      'a/thumb.jpg',
    )
  })
})
