import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import { segmentQueryKeys } from '@/entities/segment/api/segment-query-keys'

describe('v2 query keys', () => {
  it('scopes keys per journey under a domain root', () => {
    expect(segmentQueryKeys.journey('j')).toEqual(['segments', 'journey', 'j'])
    expect(momentQueryKeys.journey('j')).toEqual(['moments', 'journey', 'j'])
    expect(mediaQueryKeys.journey('j')).toEqual(['media', 'journey', 'j'])
    expect(mediaQueryKeys.detail('m')).toEqual(['media', 'detail', 'm'])
  })

  it('invalidates segments, moments and media of one journey', async () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    await invalidateJourneyTree(client, 'j')
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      segmentQueryKeys.journey('j'),
      momentQueryKeys.journey('j'),
      mediaQueryKeys.journey('j'),
    ])
  })
})
