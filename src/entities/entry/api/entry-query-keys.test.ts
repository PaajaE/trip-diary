import { describe, expect, it } from 'vitest'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'

describe('entryQueryKeys', () => {
  it('keeps list and detail namespaces separate from journey keys', () => {
    expect(entryQueryKeys.detail('entry-a')).toEqual(['entries', 'entry-a'])
    expect(journeyQueryKeys.detail('journey-a')).toEqual([
      'journeys',
      'journey-a',
    ])
    expect(entryQueryKeys.detail('entry-a')).not.toEqual(
      journeyQueryKeys.detail('entry-a'),
    )
  })

  it('returns stable keys for identical inputs', () => {
    expect(entryQueryKeys.photoPreviews('entry-a')).toEqual(
      entryQueryKeys.photoPreviews('entry-a'),
    )
    expect(entryQueryKeys.public('entry-a')).toEqual([
      'entries',
      'entry-a',
      'public',
    ])
  })

  it('uses parent prefix for domain-wide invalidation', () => {
    expect(entryQueryKeys.detail('entry-a').slice(0, 1)).toEqual(
      entryQueryKeys.all,
    )
  })
})

describe('journeyQueryKeys local and remote variants', () => {
  it('keeps local cache keys explicit', () => {
    expect(journeyQueryKeys.detailLocal('journey-a')).toEqual([
      'journeys',
      'journey-a',
      'local',
    ])
    expect(journeyQueryKeys.detail('journey-a')).toEqual([
      'journeys',
      'journey-a',
    ])
  })

  it('separates public journey reads', () => {
    expect(journeyQueryKeys.publicDetail('journey-a')).toEqual([
      'public-journeys',
      'journey-a',
    ])
  })
})
