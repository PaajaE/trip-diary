import { describe, expect, it, vi } from 'vitest'
import { createThumbnailLoader } from '@/features/media-import/api/thumbnail-loader'

describe('thumbnail loader', () => {
  it('batches requests, asks once per id and reports iCloud-only ids', async () => {
    const thumbnails = vi.fn((ids: readonly string[]) =>
      Promise.resolve(
        ids.map((id) =>
          id === 'c'
            ? { cloud: true, id, src: null }
            : { cloud: false, id, src: `src-${id}` },
        ),
      ),
    )
    const onCloud = vi.fn()
    const loader = createThumbnailLoader({ thumbnails }, { onCloud, size: 256 })
    const listener = vi.fn()
    loader.subscribe(listener)
    expect(loader.get('a').status).toBe('loading')
    loader.request(['a', 'b'])
    loader.request(['b', 'c'])
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })
    expect(thumbnails).toHaveBeenCalledTimes(1)
    expect(thumbnails).toHaveBeenCalledWith(['a', 'b', 'c'], 256)
    expect(loader.get('a')).toEqual({ src: 'src-a', status: 'ready' })
    expect(loader.get('c').status).toBe('cloud')
    expect(onCloud).toHaveBeenCalledWith(['c'])
    loader.request(['a'])
    await Promise.resolve()
    expect(thumbnails).toHaveBeenCalledTimes(1)
  })

  it('marks a failed batch as missing instead of throwing', async () => {
    const loader = createThumbnailLoader(
      { thumbnails: () => Promise.reject(new Error('native down')) },
      { size: 256 },
    )
    const listener = vi.fn()
    loader.subscribe(listener)
    loader.request(['x'])
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })
    expect(loader.get('x').status).toBe('missing')
  })
})
