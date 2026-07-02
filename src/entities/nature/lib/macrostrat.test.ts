import { describe, expect, it } from 'vitest'
import {
  parseMacrostratStratNamesResponse,
  parseMacrostratUnitsResponse,
} from '@/entities/nature/lib/macrostrat'

describe('parseMacrostratUnitsResponse', () => {
  it('returns the first named formation with age range', () => {
    expect(
      parseMacrostratUnitsResponse({
        success: {
          data: [
            { Fm: '', unit_name: 'Unnamed' },
            {
              Fm: 'Hell Creek',
              b_age: 67.55,
              t_age: 66,
              unit_name: 'Hell Creek Fm',
            },
          ],
        },
      }),
    ).toEqual({
      ageRange: '67.5–66.0 Ma',
      formationLabel: 'Hell Creek',
    })
  })
})

describe('parseMacrostratStratNamesResponse', () => {
  it('returns stratigraphic name and period range', () => {
    expect(
      parseMacrostratStratNamesResponse({
        success: {
          data: [
            {
              b_period: 'Cretaceous',
              strat_name_long: 'Hell Creek Formation',
              t_period: 'Paleogene',
            },
          ],
        },
      }),
    ).toEqual({
      ageRange: 'Cretaceous – Paleogene',
      formationLabel: 'Hell Creek Formation',
    })
  })
})
