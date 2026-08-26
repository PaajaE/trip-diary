import { describe, expect, it } from 'vitest'
import {
  buildPhotoStoragePath,
  canonicalizePhotoVariant,
  isOversizedThumbVariant,
  isPanoramaDimensions,
  pickPhotoVariantForContext,
  pickPhotoVariantPath,
  resolveMediumDimensions,
  resolveNormalizedDimensions,
  resolveSmallDimensions,
  resolveThumbDimensions,
  resolveVariantDimensions,
} from './photo-variants.ts'

describe('photo-variants policy', () => {
  it('never upscales smaller sources', () => {
    expect(resolveVariantDimensions({ width: 120, height: 80 }, 800)).toEqual({
      width: 120,
      height: 80,
    })
  })

  it('scales thumb / small / medium by longest edge and preserves aspect', () => {
    expect(resolveThumbDimensions({ width: 4032, height: 3024 })).toEqual({
      width: 220,
      height: 165,
    })
    expect(resolveSmallDimensions({ width: 4032, height: 3024 })).toEqual({
      width: 800,
      height: 600,
    })
    expect(resolveMediumDimensions({ width: 4032, height: 3024 })).toEqual({
      width: 1600,
      height: 1200,
    })
  })

  it('preserves panorama aspect for derivatives', () => {
    const source = { width: 7630, height: 3936 }
    expect(isPanoramaDimensions(source.width, source.height)).toBe(true)
    const small = resolveSmallDimensions(source)
    expect(small.width / small.height).toBeCloseTo(7630 / 3936, 2)
    expect(Math.max(small.width, small.height)).toBe(800)
  })

  it('preserves portrait orientation', () => {
    const thumb = resolveThumbDimensions({ width: 3024, height: 4032 })
    expect(thumb.width).toBeLessThan(thumb.height)
    expect(Math.max(thumb.width, thumb.height)).toBe(220)
  })

  it('caps full masters without upscaling', () => {
    const plan = resolveNormalizedDimensions({ width: 4032, height: 3024 })
    expect(Math.max(plan.width, plan.height)).toBe(2560)
    expect(plan.isPanorama).toBe(false)

    const alreadySmall = resolveNormalizedDimensions({
      width: 1200,
      height: 800,
    })
    expect(alreadySmall).toMatchObject({ width: 1200, height: 800 })
  })

  it('maps legacy preview/large to full', () => {
    expect(canonicalizePhotoVariant('preview')).toBe('full')
    expect(canonicalizePhotoVariant('large')).toBe('full')
    expect(canonicalizePhotoVariant('small')).toBe('small')
  })

  it('builds deterministic storage paths', () => {
    expect(
      buildPhotoStoragePath('creator', 'photo', 'small', 'jpg'),
    ).toBe('creator/photo/small.jpg')
  })

  it('picks context-appropriate variants with legacy fallback', () => {
    const variants = [
      { variant: 'preview', storagePath: 'a/preview.jpg' },
      { variant: 'thumb', storagePath: 'a/thumb.jpg' },
    ]
    expect(pickPhotoVariantPath(variants, 'tiny')).toBe('a/thumb.jpg')
    expect(pickPhotoVariantPath(variants, 'zoom')).toBe('a/preview.jpg')
    expect(pickPhotoVariantPath(variants, 'card')).toBe('a/thumb.jpg')

    const modern = [
      { variant: 'thumb', storage_path: 'a/thumb.jpg' },
      { variant: 'small', storage_path: 'a/small.jpg' },
      { variant: 'medium', storage_path: 'a/medium.jpg' },
      { variant: 'full', storage_path: 'a/full.jpg' },
    ]
    expect(pickPhotoVariantPath(modern, 'tiny')).toBe('a/thumb.jpg')
    expect(pickPhotoVariantPath(modern, 'card')).toBe('a/small.jpg')
    expect(pickPhotoVariantPath(modern, 'fullscreen')).toBe('a/medium.jpg')
    expect(pickPhotoVariantPath(modern, 'zoom')).toBe('a/full.jpg')
  })

  it('degrades when a requested modern variant is missing', () => {
    const variants = [
      { variant: 'full', storagePath: 'a/full.jpg' },
      { variant: 'small', storagePath: 'a/small.jpg' },
    ]
    expect(pickPhotoVariantForContext(variants, 'tiny')?.variant).toBe('small')
    expect(pickPhotoVariantForContext(variants, 'fullscreen')?.variant).toBe(
      'full',
    )
  })

  it('detects oversized legacy thumbs that should become small', () => {
    expect(isOversizedThumbVariant(800, 600)).toBe(true)
    expect(isOversizedThumbVariant(220, 165)).toBe(false)
  })
})
