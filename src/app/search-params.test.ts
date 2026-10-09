import { describe, expect, it } from 'vitest'
import {
  optionalEnum,
  optionalString,
  optionalUuid,
  searchSchema,
} from '@/app/search-params'

const parse = searchSchema({
  id: optionalUuid(),
  notice: optionalEnum(['a', 'b']),
  returnTo: optionalString(),
})

describe('searchSchema', () => {
  it('keeps known keys and drops unknown ones', () => {
    expect(
      parse({
        id: '3b241101-e2bb-4255-8caf-4136c566a962',
        notice: 'a',
        other: 1,
      }),
    ).toEqual({ id: '3b241101-e2bb-4255-8caf-4136c566a962', notice: 'a' })
  })

  it('accepts an empty search', () => {
    expect(parse({})).toEqual({})
  })

  it('throws on malformed values', () => {
    expect(() => parse({ id: 'nope' })).toThrow('id')
    expect(() => parse({ notice: 'c' })).toThrow('notice')
    expect(() => parse({ returnTo: 5 })).toThrow('returnTo')
  })
})
