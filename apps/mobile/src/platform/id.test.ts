import { describe, expect, it } from 'vitest'
import { createUuid } from './id'

describe('createUuid', () => {
  it('returns a UUID-shaped string', () => {
    const value = createUuid()

    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('returns unique values', () => {
    const values = new Set(Array.from({ length: 20 }, () => createUuid()))
    expect(values.size).toBe(20)
  })
})
