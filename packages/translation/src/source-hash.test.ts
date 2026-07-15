import { describe, expect, it } from 'vitest'
import { computeSourceContentHash } from './source-hash.ts'

describe('computeSourceContentHash', () => {
  it('hashes null title and empty body', () => {
    expect(computeSourceContentHash(null, '')).toBe('00a20e27')
  })

  it('hashes title and body with the canonical separator', () => {
    expect(computeSourceContentHash('Hello', 'World')).toBe('0f9a4fdd')
  })

  it('treats null title the same as an empty string', () => {
    expect(computeSourceContentHash(null, 'Body only')).toBe(
      computeSourceContentHash('', 'Body only'),
    )
  })

  it('returns lowercase hex padded to eight characters', () => {
    const hash = computeSourceContentHash('A', 'B')

    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('matches UTF-16 code units for non-ascii text', () => {
    expect(computeSourceContentHash('Žlutá', 'cesta')).toBe('a126a62a')
  })
})
