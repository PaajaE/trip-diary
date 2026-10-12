import { describe, expect, it } from 'vitest'
import { normalizeTipInput } from '@/entities/tip/model/tip'

const base = { body: 'Text', title: 'Titul', visibility: 'private' } as const

describe('normalizeTipInput', () => {
  it('trims, collapses title whitespace and normalizes line breaks', () => {
    const result = normalizeTipInput({
      body: '  a\r\nb \n',
      title: '  Dobré   jídlo ',
      visibility: 'public',
    })
    expect(result).toEqual({
      ok: true,
      value: { body: 'a\nb', title: 'Dobré jídlo', visibility: 'public' },
    })
  })

  it('requires a title and limits lengths by code points', () => {
    expect(normalizeTipInput({ ...base, title: '   ' })).toEqual({
      ok: false,
      reason: 'title_required',
    })
    expect(normalizeTipInput({ ...base, title: '🐻'.repeat(161) })).toEqual({
      ok: false,
      reason: 'title_too_long',
    })
    expect(normalizeTipInput({ ...base, title: '🐻'.repeat(160) }).ok).toBe(
      true,
    )
    expect(normalizeTipInput({ ...base, body: 'x'.repeat(100_001) })).toEqual({
      ok: false,
      reason: 'body_too_long',
    })
  })
})
