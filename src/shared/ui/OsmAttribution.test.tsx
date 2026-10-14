import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '@/app/i18n'
import { OsmAttribution } from '@/shared/ui/OsmAttribution'

afterEach(() => {
  cleanup()
})

describe('OsmAttribution', () => {
  it('links to the OSM copyright page with noopener in English', async () => {
    await i18n.changeLanguage('en')
    render(<OsmAttribution />)
    const link = screen.getByRole('link', {
      name: '© OpenStreetMap contributors',
    })
    expect(link.getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('is translated to Czech', async () => {
    await i18n.changeLanguage('cs')
    render(<OsmAttribution />)
    expect(
      screen.getByRole('link', { name: '© přispěvatelé OpenStreetMap' }),
    ).toBeTruthy()
    await i18n.changeLanguage('en')
  })
})
