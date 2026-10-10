import { describe, expect, it } from 'vitest'
import {
  buildMediaUrl,
  DEFAULT_MEDIA_BASE_URL,
  getThumbUrl,
  pickThumbVariant,
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
})
