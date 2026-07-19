import { describe, expect, it } from 'vitest'
import type {
  MomentPhotoMeta,
  MomentPhotoThumb,
} from '@/entities/photo/api/moment-photo-detail.repository'
import {
  countHiddenMomentPreviewPhotos,
  momentPhotoMosaicClassName,
  resolveMomentPhotoMosaicCount,
} from './moment-photo-preview-layout'

function meta(
  id: string,
  options: { isCover?: boolean } = {},
): MomentPhotoMeta {
  return {
    caption: null,
    capturedAt: null,
    id,
    isCover: options.isCover === true,
    latitude: null,
    longitude: null,
    position: 0,
  }
}

function thumb(id: string): MomentPhotoThumb {
  return { ...meta(id), thumbUrl: `https://example.test/${id}.jpg` }
}

describe('countHiddenMomentPreviewPhotos', () => {
  it('returns zero when all non-cover photos are in the preview', () => {
    const photos = [
      meta('cover', { isCover: true }),
      meta('a'),
      meta('b'),
      meta('c'),
      meta('d'),
    ]
    const preview = [thumb('a'), thumb('b'), thumb('c'), thumb('d')]
    expect(countHiddenMomentPreviewPhotos(photos, preview)).toBe(0)
  })

  it('does not treat the hero cover as a hidden preview photo', () => {
    const photos = [
      meta('cover', { isCover: true }),
      meta('a'),
      meta('b'),
      meta('c'),
      meta('d'),
    ]
    const preview = [thumb('a'), thumb('b'), thumb('c'), thumb('d')]
    // Bug regression: totalCount - preview.length would incorrectly be 1.
    expect(photos.length - preview.length).toBe(1)
    expect(countHiddenMomentPreviewPhotos(photos, preview)).toBe(0)
  })

  it('counts only non-cover photos missing from the preview', () => {
    const photos = [
      meta('cover', { isCover: true }),
      meta('a'),
      meta('b'),
      meta('c'),
      meta('d'),
      meta('e'),
      meta('f'),
    ]
    const preview = [thumb('a'), thumb('b'), thumb('c'), thumb('d'), thumb('e')]
    expect(countHiddenMomentPreviewPhotos(photos, preview)).toBe(1)
  })
})

describe('resolveMomentPhotoMosaicCount', () => {
  it('clamps to supported mosaic sizes 1–5', () => {
    expect(resolveMomentPhotoMosaicCount(1)).toBe(1)
    expect(resolveMomentPhotoMosaicCount(2)).toBe(2)
    expect(resolveMomentPhotoMosaicCount(3)).toBe(3)
    expect(resolveMomentPhotoMosaicCount(4)).toBe(4)
    expect(resolveMomentPhotoMosaicCount(5)).toBe(5)
    expect(resolveMomentPhotoMosaicCount(9)).toBe(5)
  })
})

describe('momentPhotoMosaicClassName', () => {
  it('returns deterministic layout class for each count', () => {
    expect(momentPhotoMosaicClassName(1)).toBe(
      'moment-photo-mosaic moment-photo-mosaic--1',
    )
    expect(momentPhotoMosaicClassName(4)).toBe(
      'moment-photo-mosaic moment-photo-mosaic--4',
    )
    expect(momentPhotoMosaicClassName(5)).toBe(
      'moment-photo-mosaic moment-photo-mosaic--5',
    )
  })
})
