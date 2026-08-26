import { describe, expect, it } from 'vitest'
import { buildJourneyReturnPath } from '@/features/journeys/lib/journey-return-path'

describe('buildJourneyReturnPath', () => {
  it('returns the authoring journey path', () => {
    expect(buildJourneyReturnPath('abc')).toBe('/j/abc')
  })
})
