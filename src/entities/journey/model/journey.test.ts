import { describe, expect, it } from 'vitest'
import { createJourneySchema } from '@/entities/journey/model/journey'

describe('createJourneySchema', () => {
  it('accepts a journey without dates', () => {
    expect(
      createJourneySchema.safeParse({
        endsAt: null,
        startsAt: null,
        summary: '',
        title: 'Canada 2026',
      }).success,
    ).toBe(true)
  })

  it('rejects an end date before the start date', () => {
    expect(
      createJourneySchema.safeParse({
        endsAt: '2026-06-01',
        startsAt: '2026-06-10',
        summary: '',
        title: 'Canada 2026',
      }).success,
    ).toBe(false)
  })
})
