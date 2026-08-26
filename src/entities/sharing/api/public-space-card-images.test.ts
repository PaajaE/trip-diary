import { describe, expect, it } from 'vitest'
import {
  buildCoverSrcSetFromVariants,
  pickVariantPreferenceForCardContext,
  pickVariantPreferenceForTinyContext,
} from '@/entities/sharing/api/public-space-card-images'

describe('public-space-card-images variant policy', () => {
  const variants = [
    { storage_path: 'user/photo/thumb.webp', variant: 'thumb' },
    { storage_path: 'user/photo/small.webp', variant: 'small' },
    { storage_path: 'user/photo/medium.webp', variant: 'medium' },
    { storage_path: 'user/photo/full.webp', variant: 'full' },
  ] as const

  it('prefers thumb for tiny entry thumbnails', () => {
    expect(pickVariantPreferenceForTinyContext(variants)).toBe(
      'user/photo/thumb.webp',
    )
  })

  it('prefers small for large profile journey covers', () => {
    expect(pickVariantPreferenceForCardContext(variants)).toBe(
      'user/photo/small.webp',
    )
  })

  it('builds a small/medium srcset for journey covers', () => {
    const srcSet = buildCoverSrcSetFromVariants(
      variants,
      new Map([
        ['user/photo/small.webp', 'https://cdn.test/small.webp'],
        ['user/photo/medium.webp', 'https://cdn.test/medium.webp'],
      ]),
    )

    expect(srcSet).toBe(
      'https://cdn.test/small.webp 800w, https://cdn.test/medium.webp 1600w',
    )
  })
})
