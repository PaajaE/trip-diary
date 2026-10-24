import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_STORAGE_KEY,
  initTheme,
  readThemePreference,
  setThemePreference,
} from '@/shared/lib/theme'

type Listener = () => void

function mockMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<Listener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches
      },
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    })),
  )
  return {
    set(value: boolean) {
      matches = value
      listeners.forEach((l) => {
        l()
      })
    },
    count: () => listeners.size,
  }
}

const themeColor = () =>
  document.head
    .querySelector('meta[name="theme-color"]')
    ?.getAttribute('content')

describe('theme preference', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.head.innerHTML = '<meta name="theme-color" content="#285845" />'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('defaults to auto and ignores junk values', () => {
    expect(readThemePreference()).toBe('auto')
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    expect(readThemePreference()).toBe('auto')
  })

  it('falls back to auto when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readThemePreference()).toBe('auto')
  })

  it('does not throw when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mockMatchMedia(false)
    expect(() => {
      setThemePreference('dark')
    }).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists and applies an explicit choice with the theme colour', () => {
    mockMatchMedia(false)
    setThemePreference('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeColor()).toBe(DARK_THEME_COLOR)

    setThemePreference('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(themeColor()).toBe(LIGHT_THEME_COLOR)
  })

  it('auto removes the attribute and clears storage', () => {
    mockMatchMedia(true)
    setThemePreference('light')
    setThemePreference('auto')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(themeColor()).toBe(DARK_THEME_COLOR)
  })

  it('initTheme follows OS changes only while auto', () => {
    const media = mockMatchMedia(false)
    const stop = initTheme()
    expect(themeColor()).toBe(LIGHT_THEME_COLOR)
    media.set(true)
    expect(themeColor()).toBe(DARK_THEME_COLOR)

    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    media.set(false)
    media.set(true)
    expect(themeColor()).toBe(DARK_THEME_COLOR)
    stop()
    expect(media.count()).toBe(0)
  })

  it('initTheme applies a stored preference', () => {
    mockMatchMedia(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    initTheme()()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
