import { describe, expect, it } from 'vitest'
import {
  normalizeTagLabel,
  slugifyTagLabel,
  speciesSlug,
} from '@/entities/tag/model/tag'

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/

describe('slugifyTagLabel', () => {
  it('folds diacritics and punctuation', () => {
    expect(slugifyTagLabel('Západ slunce!')).toBe('zapad-slunce')
    expect(slugifyTagLabel('  Čaj & káva  ')).toBe('caj-kava')
  })

  it('falls back to code points when no ASCII remains and stays valid', () => {
    for (const label of ['🐻', 'Медведь', '🐻🐻']) {
      expect(slugifyTagLabel(label)).toMatch(SLUG)
    }
    expect(slugifyTagLabel('🐻')).not.toBe(slugifyTagLabel('🦌'))
  })

  it('caps the length without a trailing dash', () => {
    const slug = slugifyTagLabel(`${'a'.repeat(79)} b`)
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug).toMatch(SLUG)
  })

  it('builds the species slug', () => {
    expect(speciesSlug(2433407)).toBe('s-2433407')
  })
})

describe('normalizeTagLabel', () => {
  it('collapses whitespace and rejects empty or too long labels', () => {
    expect(normalizeTagLabel('  a   b ')).toBe('a b')
    expect(normalizeTagLabel('   ')).toBeNull()
    expect(normalizeTagLabel('x'.repeat(121))).toBeNull()
    expect(normalizeTagLabel('x'.repeat(120))).not.toBeNull()
  })
})
