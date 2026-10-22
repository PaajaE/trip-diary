import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampMapWidth,
  DEFAULT_LAYOUT,
  isShortcutBlocked,
  LAYOUT_STORAGE_KEY,
  mapWidthBounds,
  readStoredLayout,
  storeLayout,
} from '@/features/journey-workspace/lib/workspace-layout'

describe('mapWidthBounds', () => {
  it('caps at 60 % of the row and leaves room for rail and cards', () => {
    expect(mapWidthBounds(1500, 220).max).toBe(900)
    // 1200 - 220 - 14 - 360 = 606 < 720
    expect(mapWidthBounds(1200, 220).max).toBe(606)
  })
  it('never drops below the minimum', () => {
    expect(mapWidthBounds(1000, 220)).toEqual({ max: 406, min: 280 })
    expect(mapWidthBounds(700, 220).max).toBe(280)
  })
})

describe('clampMapWidth', () => {
  it('clamps to the bounds', () => {
    expect(clampMapWidth(100, 1400, 220, false)).toBe(280)
    expect(clampMapWidth(5000, 1400, 220, false)).toBe(806)
  })
  it('snaps to a third and a half within 14 px', () => {
    expect(clampMapWidth(470, 1400, 220, true)).toBe(467)
    expect(clampMapWidth(690, 1400, 220, true)).toBe(700)
    expect(clampMapWidth(500, 1400, 220, true)).toBe(500)
  })
  it('does not snap when asked not to', () => {
    expect(clampMapWidth(470, 1400, 220, false)).toBe(470)
  })
  it('keeps a snapped width inside the bounds', () => {
    // Max is 900 - 220 - 14 - 360 = 306; 1/3 of the row (300) is within it.
    expect(clampMapWidth(450, 900, 220, true)).toBe(300)
    expect(clampMapWidth(305, 900, 220, true)).toBe(300)
  })
})

describe('layout storage', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round-trips the layout', () => {
    storeLayout({ map: 'hidden', mapW: 420, rail: 'collapsed' })
    expect(readStoredLayout()).toEqual({
      map: 'hidden',
      mapW: 420,
      rail: 'collapsed',
    })
  })
  it('falls back to defaults for missing or broken data', () => {
    expect(readStoredLayout()).toEqual(DEFAULT_LAYOUT)
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{nope')
    expect(readStoredLayout()).toEqual(DEFAULT_LAYOUT)
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ map: 'full', mapW: 'x', rail: 7 }),
    )
    expect(readStoredLayout()).toEqual(DEFAULT_LAYOUT)
  })
  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readStoredLayout()).toEqual(DEFAULT_LAYOUT)
    expect(() => {
      storeLayout(DEFAULT_LAYOUT)
    }).not.toThrow()
  })
})

describe('isShortcutBlocked', () => {
  it('blocks modifiers and text fields', () => {
    expect(
      isShortcutBlocked(new KeyboardEvent('keydown', { metaKey: true })),
    ).toBe(true)
    const input = document.createElement('input')
    document.body.append(input)
    const event = new KeyboardEvent('keydown', { bubbles: true })
    input.dispatchEvent(event)
    expect(isShortcutBlocked(event)).toBe(true)
    input.remove()
    expect(isShortcutBlocked(new KeyboardEvent('keydown', { key: 'm' }))).toBe(
      false,
    )
  })
})
