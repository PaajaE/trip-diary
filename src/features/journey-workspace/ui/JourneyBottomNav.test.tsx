import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { JourneyBottomNav } from '@/features/journey-workspace/ui/JourneyBottomNav'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    search,
    to,
    ...rest
  }: {
    children: ReactNode
    'aria-current'?: 'page'
    className?: string
    onClick?: () => void
    search?: { map?: string }
    to: string
  }) => (
    <a
      aria-current={rest['aria-current']}
      className={rest.className}
      data-map={search?.map}
      href={to}
      onClick={rest.onClick}
    >
      {children}
    </a>
  ),
}))

describe('JourneyBottomNav', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('offers journey, sorting, add, map and read, with the current page marked', () => {
    render(
      <JourneyBottomNav
        batchCount={7}
        current="batch"
        journeyId="j"
        publicPaths={{ journeySlug: 'iceland', spaceHandle: 'pavel' }}
      />,
    )
    const nav = screen.getByRole('navigation', {
      name: 'Journey bottom navigation',
    })
    expect(nav.className).toContain('sm:hidden')
    expect(nav.className).toContain('env(safe-area-inset-bottom)')
    expect(screen.getByRole('link', { name: /Sorting/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByTestId('bottom-nav-badge')).toHaveTextContent('7')
    expect(screen.getByRole('link', { name: 'Journey' })).toHaveAttribute(
      'href',
      '/j/$journeyId/workspace',
    )
    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute(
      'data-map',
      'full',
    )
    expect(screen.getByRole('link', { name: 'Read' })).toHaveAttribute(
      'href',
      '/$spaceHandle/$journeySlug',
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('disables Read with an explanation when the journey is not public', () => {
    render(
      <JourneyBottomNav current="workspace" journeyId="j" publicPaths={null} />,
    )
    expect(screen.queryByRole('link', { name: 'Read' })).toBeNull()
    const disabled = screen.getByTestId('bottom-nav-read-disabled')
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    expect(disabled).toHaveAttribute(
      'title',
      'The journey is not public yet, so there is no public page.',
    )
  })

  it('opens the add sheet with note and photos, closes on Escape and returns focus', () => {
    render(
      <JourneyBottomNav current="workspace" journeyId="j" publicPaths={null} />,
    )
    const plus = screen.getByRole('button', { name: 'Add' })
    plus.focus()
    fireEvent.click(plus)
    const dialog = screen.getByRole('dialog', {
      name: 'What do you want to add?',
    })
    expect(dialog).toBeTruthy()
    expect(screen.getByRole('link', { name: /^Note/ })).toHaveAttribute(
      'href',
      '/j/$journeyId/quick',
    )
    expect(screen.getByRole('link', { name: /^Photos/ })).toHaveAttribute(
      'href',
      '/j/$journeyId/import',
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(plus)
  })

  it('closes the sheet after choosing an option', () => {
    render(
      <JourneyBottomNav current="workspace" journeyId="j" publicPaths={null} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('link', { name: /^Note/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
