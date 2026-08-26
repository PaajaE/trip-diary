import { describe, expect, it } from 'vitest'
import {
  groupVariantsByPhotoId,
  pickCardPhotoVariantPath,
  pickDetailPhotoVariantPath,
} from '@/features/photos/lib/pick-photo-variant-path'

describe('pickPhotoVariantPath', () => {
  it('prefers small for cards, then thumb, then medium/full/legacy', () => {
    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/full.jpg', variant: 'full' },
        { photoId: 'p1', storagePath: 'a/medium.jpg', variant: 'medium' },
        { photoId: 'p1', storagePath: 'a/small.jpg', variant: 'small' },
        { photoId: 'p1', storagePath: 'a/thumb.jpg', variant: 'thumb' },
      ]),
    ).toBe('a/small.jpg')

    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/full.jpg', variant: 'full' },
        { photoId: 'p1', storagePath: 'a/thumb.jpg', variant: 'thumb' },
      ]),
    ).toBe('a/thumb.jpg')

    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/preview.jpg', variant: 'preview' },
        { photoId: 'p1', storagePath: 'a/large.jpg', variant: 'large' },
      ]),
    ).toBe('a/preview.jpg')

    expect(
      pickCardPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/large.jpg', variant: 'large' },
      ]),
    ).toBe('a/large.jpg')
  })

  it('prefers medium for detail/fullscreen, falling back to full then legacy', () => {
    expect(
      pickDetailPhotoVariantPath([
        { photoId: 'p1', storagePath: 'a/thumb.jpg', variant: 'thumb' },
        { photoId: 'p1', storagePath: 'a/small.jpg', variant: 'small' },
        { photoId: 'p1', storagePath: 'a/medium.jpg', variant: 'medium' },
        { photoId: 'p1', storagePath: 'a/full.jpg', variant: 'full' },
      ]),
    ).toBe('a/medium.jpg')

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
      { photo_id: 'p2', storage_path: 'b/full.jpg', variant: 'full' },
      { photo_id: 'p1', storage_path: 'a/small.jpg', variant: 'small' },
    ])

    expect(grouped.get('p1')).toHaveLength(2)
    expect(pickCardPhotoVariantPath(grouped.get('p1') ?? [])).toBe(
      'a/small.jpg',
    )
  })
})
