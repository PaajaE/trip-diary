import { describe, expect, it } from 'vitest'
import {
  buildMediaUrl,
  DEFAULT_MEDIA_BASE_URL,
  getSharpThumb,
  getThumbUrl,
  pickThumbVariant,
  pickZoomImageVariant,
} from '@/features/journey-workspace/lib/media-thumb'
import { med, variant } from '@/features/journey-workspace/test-fixtures'

describe('media thumbnails', () => {
  it('prefers thumb, then small, medium, large for photos', () => {
    const id = med(1).id
    const mk = (...kinds: Parameters<typeof variant>[1][]) =>
      med(1, { variants: kinds.map((k) => variant(id, k)) })
    expect(pickThumbVariant(mk('large', 'small', 'thumb'))?.kind).toBe('thumb')
    expect(pickThumbVariant(mk('large', 'small'))?.kind).toBe('small')
    expect(pickThumbVariant(mk('large', 'medium'))?.kind).toBe('medium')
    expect(pickThumbVariant(mk('large'))?.kind).toBe('large')
    expect(pickThumbVariant(mk())).toBeNull()
  })

  it('uses the poster for videos and never the mp4 variant', () => {
    const id = med(1).id
    const video = med(1, {
      kind: 'video',
      variants: [variant(id, 'video'), variant(id, 'poster', 'k/p.jpg')],
    })
    expect(getThumbUrl(video)).toBe(`${DEFAULT_MEDIA_BASE_URL}/k/p.jpg`)
    const noPoster = med(1, { kind: 'video', variants: [variant(id, 'video')] })
    expect(getThumbUrl(noPoster)).toBeNull()
  })

  it('joins base url and key without double slashes', () => {
    expect(buildMediaUrl('/a/b.webp', 'https://m.example/')).toBe(
      'https://m.example/a/b.webp',
    )
  })

  it('zoom takes the largest variant, never a smaller one when a larger exists', () => {
    const id = med(1).id
    const mk = (...kinds: Parameters<typeof variant>[1][]) =>
      med(1, { variants: kinds.map((k) => variant(id, k)) })
    expect(pickZoomImageVariant(mk('thumb', 'medium', 'large'))?.kind).toBe(
      'large',
    )
    expect(pickZoomImageVariant(mk('large'))?.kind).toBe('large')
    expect(pickZoomImageVariant(mk('thumb', 'small'))?.kind).toBe('small')
    expect(pickZoomImageVariant(mk())).toBeNull()
    const video = med(1, {
      kind: 'video',
      variants: [variant(id, 'video'), variant(id, 'poster', 'k/p.jpg')],
    })
    expect(pickZoomImageVariant(video)?.kind).toBe('poster')
  })
})

describe('getSharpThumb', () => {
  it('offers thumb and small by their widths, src is the small one', () => {
    const id = med(1).id
    const item = med(1, {
      variants: [
        { ...variant(id, 'thumb', 'k/t.webp'), width: 205 },
        { ...variant(id, 'small', 'k/s.webp'), width: 747 },
      ],
    })
    const sharp = getSharpThumb(item)
    expect(sharp?.src).toBe(`${DEFAULT_MEDIA_BASE_URL}/k/s.webp`)
    expect(sharp?.srcSet).toBe(
      `${DEFAULT_MEDIA_BASE_URL}/k/t.webp 205w, ${DEFAULT_MEDIA_BASE_URL}/k/s.webp 747w`,
    )
  })

  it('falls back to the plain thumb without both widths and for videos', () => {
    const id = med(1).id
    const onlyThumb = med(1, { variants: [variant(id, 'thumb', 'k/t.webp')] })
    expect(getSharpThumb(onlyThumb)).toEqual({
      src: `${DEFAULT_MEDIA_BASE_URL}/k/t.webp`,
      srcSet: null,
    })
    const video = med(1, {
      kind: 'video',
      variants: [variant(id, 'poster', 'k/p.jpg'), variant(id, 'small')],
    })
    expect(getSharpThumb(video)?.srcSet).toBeNull()
    expect(getSharpThumb(med(1, { variants: [] }))).toBeNull()
  })
})
