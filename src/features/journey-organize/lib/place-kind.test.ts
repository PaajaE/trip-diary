import { describe, expect, it } from 'vitest'
import { derivePlace } from '@/features/journey-organize/lib/place-kind'

describe('derivePlace', () => {
  it('turns the "u X" label into a near place', () => {
    expect(derivePlace({ name: 'u Falkland', region: null })).toEqual({
      kind: 'near',
      name: 'Falkland',
    })
  })

  it('recognises the region fallback', () => {
    expect(derivePlace({ name: 'Yukon', region: 'Yukon' }).kind).toBe('region')
  })

  it('recognises natural features and attractions', () => {
    expect(derivePlace({ name: 'Sunburst Peak', region: null }).kind).toBe(
      'natural',
    )
    expect(derivePlace({ name: 'Lake Viewpoint', region: null }).kind).toBe(
      'attraction',
    )
  })

  it('prefers the stored kind over the heuristics', () => {
    expect(
      derivePlace({ kind: 'settlement', name: 'Mount Royal', region: null }),
    ).toEqual({ kind: 'settlement', name: 'Mount Royal' })
    expect(
      derivePlace({ kind: null, name: 'Sunburst Peak', region: null }).kind,
    ).toBe('natural')
  })

  it('leaves other names unknown', () => {
    expect(
      derivePlace({ name: 'Whitehorse', region: null }).kind,
    ).toBeUndefined()
  })
})
