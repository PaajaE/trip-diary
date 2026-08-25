import { describe, expect, it } from 'vitest'
import { excerptText } from '@/features/journeys/lib/excerpt-text'

describe('excerptText', () => {
  it('returns short text unchanged', () => {
    expect(excerptText('Hello world')).toBe('Hello world')
  })

  it('clips long text on a word boundary', () => {
    const body =
      'A quiet morning in Banff with snow still on the peaks and a long walk ahead of us today.'
    const excerpt = excerptText(body, 72)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.includes('Banff')).toBe(true)
    expect(excerpt.length).toBeLessThan(body.length)
  })
})
