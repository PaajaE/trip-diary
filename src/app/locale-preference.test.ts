import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectBrowserLocale,
  resolveInitialLocale,
  storeLocale,
} from '@/app/locale-preference'

function setLanguages(languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
}

describe('locale preference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('maps Czech and Slovak browsers to Czech', () => {
    setLanguages(['cs-CZ', 'en'])
    expect(detectBrowserLocale()).toBe('cs')
    setLanguages(['sk'])
    expect(detectBrowserLocale()).toBe('cs')
  })

  it('falls back to English for other languages', () => {
    setLanguages(['de-DE'])
    expect(detectBrowserLocale()).toBe('en')
  })

  it('prefers the stored choice over the browser language', () => {
    setLanguages(['cs-CZ'])
    storeLocale('en')
    expect(resolveInitialLocale()).toBe('en')
  })
})
