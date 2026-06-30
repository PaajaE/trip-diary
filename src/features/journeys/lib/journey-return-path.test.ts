import { describe, expect, it } from 'vitest'
import { buildJourneyReturnPath } from '@/features/journeys/lib/journey-return-path'

describe('buildJourneyReturnPath', () => {
  it('omits section for overview', () => {
    expect(buildJourneyReturnPath('abc', 'overview')).toBe('/j/abc')
  })

  it('includes section for other tabs', () => {
    expect(buildJourneyReturnPath('abc', 'gallery')).toBe(
      '/j/abc?section=gallery',
    )
  })
})
