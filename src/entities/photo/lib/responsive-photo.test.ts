import { describe, expect, it } from 'vitest'
import {
  buildResponsivePhotoSources,
  buildSrcsetFromVariantUrls,
} from '@/entities/photo/lib/responsive-photo'

describe('buildResponsivePhotoSources', () => {
  it('returns null for empty sources', () => {
    expect(buildResponsivePhotoSources([])).toBeNull()
  })

  it('builds srcset from multiple widths', () => {
    expect(
      buildResponsivePhotoSources(
        [
          { url: '/m.jpg', width: 1600 },
          { url: '/t.jpg', width: 220 },
          { url: '/s.jpg', width: 800 },
        ],
        { sizes: '50vw' },
      ),
    ).toEqual({
      sizes: '50vw',
      src: '/t.jpg',
      srcSet: '/t.jpg 220w, /s.jpg 800w, /m.jpg 1600w',
    })
  })
})

describe('buildSrcsetFromVariantUrls', () => {
  it('maps canonical variants and treats preview as full', () => {
    expect(
      buildSrcsetFromVariantUrls({
        preview: '/legacy.jpg',
        small: '/s.jpg',
        thumb: '/t.jpg',
      }),
    ).toEqual({
      src: '/t.jpg',
      srcSet: '/t.jpg 220w, /s.jpg 800w, /legacy.jpg 2560w',
    })
  })
})
