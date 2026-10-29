import { describe, expect, it } from 'vitest'
import { normalizeDevice } from './device-name.ts'

describe('normalizeDevice', () => {
  it.each([
    ['Canon', 'Canon EOS R5', 'Canon EOS R5'],
    ['CANON', 'Canon EOS R5', 'Canon EOS R5'],
    ['Apple', 'iPhone 15 Pro', 'Apple iPhone 15 Pro'],
    ['  Sony ', '  ILCE-7M4\u0000 ', 'Sony ILCE-7M4'],
    ['Google', 'Pixel\t 8\n Pro', 'Google Pixel 8 Pro'],
    ['Apple', '', 'Apple'],
    ['', 'GoPro HERO12', 'GoPro HERO12'],
    ['Nikon', null, 'Nikon'],
    ['Škoda', 'Fotoaparát Č', 'Škoda Fotoaparát Č'],
  ])('%j + %j -> %j', (make, model, expected) => {
    expect(normalizeDevice(make, model)).toBe(expected)
  })

  it.each([
    [null, null],
    [undefined, undefined],
    ['', '  '],
    [42, {}],
    ['\u0000\u0001', '\u200b'],
  ])('returns null for %j / %j', (make, model) => {
    expect(normalizeDevice(make, model)).toBeNull()
  })

  it('caps at 120 chars on a word boundary', () => {
    const result = normalizeDevice('Acme', `${'word '.repeat(40)}end`)
    expect(result).not.toBeNull()
    expect(result?.length).toBeLessThanOrEqual(120)
    expect(result?.endsWith('word')).toBe(true)
  })

  it('hard-cuts a long single token without splitting a surrogate pair', () => {
    const result = normalizeDevice(null, `${'a'.repeat(119)}😀tail`)
    expect(result).toBe('a'.repeat(119))
    const long = normalizeDevice(null, 'b'.repeat(300))
    expect(long?.length).toBe(120)
  })
})
