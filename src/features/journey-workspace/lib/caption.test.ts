import { describe, expect, it } from 'vitest'
import {
  CAPTION_MAX_LENGTH,
  normalizeCaption,
} from '@/features/journey-workspace/lib/caption'

describe('normalizeCaption', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeCaption('  Sunset  ')).toEqual({
      ok: true,
      value: 'Sunset',
    })
  })
  it('turns empty and whitespace-only input into null', () => {
    expect(normalizeCaption('')).toEqual({ ok: true, value: null })
    expect(normalizeCaption(' \n\t ')).toEqual({ ok: true, value: null })
  })
  it('accepts exactly the limit and rejects one more', () => {
    expect(normalizeCaption('a'.repeat(CAPTION_MAX_LENGTH)).ok).toBe(true)
    expect(normalizeCaption('a'.repeat(CAPTION_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })
  it('counts characters, not UTF-16 units', () => {
    expect(normalizeCaption('😀'.repeat(CAPTION_MAX_LENGTH)).ok).toBe(true)
  })
  it('measures the limit after trimming', () => {
    expect(normalizeCaption(` ${'a'.repeat(CAPTION_MAX_LENGTH)} `).ok).toBe(
      true,
    )
  })
})
