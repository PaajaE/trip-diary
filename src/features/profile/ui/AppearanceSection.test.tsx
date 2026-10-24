import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { AppearanceSection } from '@/features/profile/ui/AppearanceSection'
import { THEME_STORAGE_KEY } from '@/shared/lib/theme'

describe('AppearanceSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(cleanup)

  it('exposes a labelled radio group defaulting to automatic', () => {
    render(<AppearanceSection />)
    expect(screen.getByRole('group', { name: 'Vzhled' })).toBeVisible()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Automaticky/ })).toBeChecked()
  })

  it('applies and persists a choice immediately', async () => {
    const user = userEvent.setup()
    render(<AppearanceSection />)

    await user.click(screen.getByRole('radio', { name: 'Tmavý' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('radio', { name: /Automaticky/ }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('starts from the stored preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(<AppearanceSection />)
    expect(screen.getByRole('radio', { name: 'Světlý' })).toBeChecked()
  })
})
