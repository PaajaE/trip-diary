import { describe, expect, it } from 'vitest'
import {
  BODY_MAX_LENGTH,
  codePointLength,
  normalizeBody,
  normalizeMomentTitle,
  normalizeSegmentTitle,
} from '@/features/journey-workspace/lib/text-edit'

describe('text-edit', () => {
  it('counts code points, not UTF-16 units', () => {
    expect(codePointLength('a😀b')).toBe(3)
  })

  it('trims segment titles and rejects empty ones', () => {
    expect(normalizeSegmentTitle('  Alps ')).toEqual({
      ok: true,
      value: 'Alps',
    })
    expect(normalizeSegmentTitle('   ')).toEqual({
      ok: false,
      reason: 'title_required',
    })
  })

  it('limits titles to 160 code points', () => {
    expect(normalizeSegmentTitle('😀'.repeat(160)).ok).toBe(true)
    expect(normalizeSegmentTitle('😀'.repeat(161))).toEqual({
      ok: false,
      reason: 'title_too_long',
    })
    expect(normalizeMomentTitle('x'.repeat(161)).ok).toBe(false)
  })

  it('turns an empty moment title into null', () => {
    expect(normalizeMomentTitle('  \n ')).toEqual({ ok: true, value: null })
    expect(normalizeMomentTitle(' Lunch ')).toEqual({
      ok: true,
      value: 'Lunch',
    })
  })

  it('keeps line breaks in the body and limits it by code points', () => {
    expect(normalizeBody(' a\n\nb \n')).toEqual({ ok: true, value: 'a\n\nb' })
    expect(normalizeBody('   ')).toEqual({ ok: true, value: '' })
    expect(normalizeBody('😀'.repeat(BODY_MAX_LENGTH)).ok).toBe(true)
    expect(normalizeBody('😀'.repeat(BODY_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'body_too_long',
    })
  })
})
