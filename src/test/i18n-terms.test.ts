import { describe, expect, it } from 'vitest'
import { cs, en } from '@trip-diary/i18n'

describe('v2 terminology', () => {
  it('has identical term keys in cs and en', () => {
    for (const name of Object.keys(en.terms)) {
      expect(
        Object.keys(cs.terms[name as keyof typeof cs.terms]).sort(),
      ).toEqual(Object.keys(en.terms[name as keyof typeof en.terms]).sort())
    }
    expect(Object.keys(cs.terms).sort()).toEqual(Object.keys(en.terms).sort())
  })

  it('keeps the existing landing-page kinds consistent', () => {
    expect(cs.terms.stage.singular).toBe(cs.home.structure.kinds.stage)
    expect(en.terms.trip.singular).toBe(en.home.structure.kinds.trip)
  })
})
