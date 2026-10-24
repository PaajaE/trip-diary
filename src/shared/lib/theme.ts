export type ThemePreference = 'auto' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'trip-diary:theme'

/** Same value as the static `<meta name="theme-color">` in index.html. */
export const LIGHT_THEME_COLOR = '#285845'
export const DARK_THEME_COLOR = '#121512'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'light' || value === 'dark'
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'auto') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage may be blocked; the choice then lasts for this session only.
  }
}

function prefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(DARK_QUERY).matches
  )
}

function setThemeColorMeta(color: string): void {
  let meta = document.head.querySelector('meta[name="theme-color"]')
  if (meta === null) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)
}

/** Sets `data-theme` (none for auto) and the matching browser theme colour. */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement
  if (preference === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', preference)
  const dark = preference === 'dark' || (preference === 'auto' && prefersDark())
  setThemeColorMeta(dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
}

/**
 * Applies the stored preference and keeps `auto` in step with the OS setting.
 * Returns a cleanup function.
 */
export function initTheme(): () => void {
  applyThemePreference(readThemePreference())
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(DARK_QUERY)
  const onChange = () => {
    if (readThemePreference() === 'auto') applyThemePreference('auto')
  }
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

/** Persists and applies a new preference (device-only, no server). */
export function setThemePreference(preference: ThemePreference): void {
  writeThemePreference(preference)
  applyThemePreference(preference)
}
