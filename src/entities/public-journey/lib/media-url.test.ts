import { describe, expect, it } from 'vitest'
import {
  buildSrcSet,
  publicMediaUrl,
  resolveImage,
  resolveVideo,
} from '@/entities/public-journey/lib/media-url'
import { publicJourneyFixture } from '@/entities/public-journey/lib/public-journey.fixture'

const BASE = 'https://cdn.example.com/'

describe('public media urls', () => {
  it('joins base and storage key without double slashes', () => {
    expect(publicMediaUrl('/a/b.webp', BASE)).toBe(
      'https://cdn.example.com/a/b.webp',
    )
  })

  it('builds srcset with width descriptors, ascending, ignoring video variants', () => {
    const photo = publicJourneyFixture.media[0]
    expect(photo).toBeDefined()
    expect(buildSrcSet(photo?.variants ?? [], BASE)).toBe(
      [
        'https://cdn.example.com/k/t.webp 200w',
        'https://cdn.example.com/k/s.webp 600w',
        'https://cdn.example.com/k/m.webp 1200w',
        'https://cdn.example.com/k/l.webp 2400w',
      ].join(', '),
    )
  })

  it('uses the medium variant as fallback src with its intrinsic size', () => {
    const photo = publicJourneyFixture.media[0]
    const image = photo === undefined ? null : resolveImage(photo, BASE)
    expect(image).toMatchObject({
      height: 900,
      src: 'https://cdn.example.com/k/m.webp',
      width: 1200,
    })
  })

  it('resolves video to mp4 plus poster, and the poster as its image', () => {
    const video = publicJourneyFixture.media[1]
    expect(video).toBeDefined()
    if (video === undefined) return
    expect(resolveVideo(video, BASE)).toMatchObject({
      poster: 'https://cdn.example.com/k/p.jpg',
      src: 'https://cdn.example.com/k/v.mp4',
    })
    expect(resolveImage(video, BASE)?.src).toBe(
      'https://cdn.example.com/k/p.jpg',
    )
  })
})
