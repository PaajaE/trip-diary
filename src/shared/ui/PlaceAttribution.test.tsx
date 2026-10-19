import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/app/i18n'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

afterEach(() => {
  cleanup()
})

describe('PlaceAttribution', () => {
  it('links to Mapy.com with noopener in English', async () => {
    await i18n.changeLanguage('en')
    render(<PlaceAttribution />)
    const link = screen.getByRole('link', {
      name: 'Place names © Seznam.cz a.s.',
    })
    expect(link.getAttribute('href')).toBe('https://mapy.com')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('is translated to Czech', async () => {
    await i18n.changeLanguage('cs')
    render(<PlaceAttribution />)
    expect(
      screen.getByRole('link', { name: 'Názvy míst © Seznam.cz a.s.' }),
    ).toBeTruthy()
    await i18n.changeLanguage('en')
  })
})
