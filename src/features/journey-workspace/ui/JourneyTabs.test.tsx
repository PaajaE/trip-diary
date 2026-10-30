import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { JourneyTabs } from '@/features/journey-workspace/ui/JourneyTabs'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: ReactNode
    'aria-current'?: 'page'
    className?: string
    onClick?: () => void
    role?: string
    to: string
  }) => (
    <a
      aria-current={rest['aria-current']}
      className={rest.className}
      href={to}
      role={rest.role}
      onClick={rest.onClick}
    >
      {children}
    </a>
  ),
}))

function MemoryTabs() {
  return <JourneyTabs current="workspace" journeyId="j" publicPaths={null} />
}

describe('JourneyTabs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('marks only the current tab with aria-current', () => {
    render(<JourneyTabs current="import" journeyId="j" publicPaths={null} />)
    expect(screen.getByRole('link', { name: 'Add' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Journey' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(screen.getByRole('link', { name: 'Note' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Manage journey/ }),
    ).not.toHaveAttribute('aria-current')
  })

  it('orders the tabs by work flow with the manage menu last before the public page', () => {
    render(<MemoryTabs />)
    const names = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent.trim())
    expect(names).toEqual([
      'Journey',
      'New days',
      'Sorting',
      'Add',
      'Note',
      'Manage journey',
      'Public page (The journey is not public yet, so there is no public page.)',
    ])
  })

  it('keeps members and trash in a menu that highlights its button', () => {
    const { rerender } = render(
      <JourneyTabs current="members" journeyId="j" publicPaths={null} />,
    )
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
    const button = screen.getByRole('button', { name: /Manage journey/ })
    expect(button).toHaveAttribute('aria-current', 'page')
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeTruthy()
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Members',
      'Publishing and privacy',
      'Trash',
    ])
    expect(items[0]).toHaveAttribute('aria-current', 'page')
    expect(items[1]).not.toHaveAttribute('aria-current')
    rerender(<JourneyTabs current="trash" journeyId="j" publicPaths={null} />)
    expect(button).toHaveAttribute('aria-current', 'page')
  })

  it('moves focus with arrow keys and closes on Escape returning to the button', () => {
    render(<JourneyTabs current="workspace" journeyId="j" publicPaths={null} />)
    const button = screen.getByRole('button', { name: /Manage journey/ })
    expect(button).not.toHaveAttribute('aria-current')
    fireEvent.click(button)
    const [members, publishing, trash] = screen.getAllByRole('menuitem')
    if (
      members === undefined ||
      publishing === undefined ||
      trash === undefined
    ) {
      throw new Error('items')
    }
    expect(document.activeElement).toBe(members)
    fireEvent.keyDown(members, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(publishing)
    fireEvent.keyDown(publishing, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(trash)
    fireEvent.keyDown(trash, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(members)
    fireEvent.keyDown(members, { key: 'End' })
    expect(document.activeElement).toBe(trash)
    fireEvent.keyDown(trash, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('links to the public page when the journey is public', () => {
    render(
      <JourneyTabs
        current="workspace"
        journeyId="j"
        publicPaths={{ journeySlug: 'iceland', spaceHandle: 'pavel' }}
      />,
    )
    expect(screen.getByRole('link', { name: 'Public page' })).toHaveAttribute(
      'href',
      '/$spaceHandle/$journeySlug',
    )
    expect(screen.queryByTestId('public-tab-disabled')).toBeNull()
  })

  it('shows a disabled public tab with a hint when the journey is not public', () => {
    render(<JourneyTabs current="workspace" journeyId="j" publicPaths={null} />)
    expect(screen.queryByRole('link', { name: 'Public page' })).toBeNull()
    const disabled = screen.getByTestId('public-tab-disabled')
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    expect(disabled).toHaveAttribute(
      'title',
      'The journey is not public yet, so there is no public page.',
    )
  })

  it('links to the batch and shows a count badge only when media waits', () => {
    const { rerender } = render(
      <JourneyTabs current="workspace" journeyId="j" publicPaths={null} />,
    )
    expect(screen.getByRole('link', { name: 'Sorting' })).toHaveAttribute(
      'href',
      '/j/$journeyId/batch',
    )
    expect(screen.queryByTestId('batch-badge')).toBeNull()
    rerender(
      <JourneyTabs
        batchCount={12}
        current="batch"
        journeyId="j"
        publicPaths={null}
      />,
    )
    expect(screen.getByTestId('batch-badge')).toHaveTextContent('12')
    expect(
      screen.getByRole('link', { name: /Sorting.*12 waiting to be sorted/ }),
    ).toHaveAttribute('aria-current', 'page')
    rerender(
      <JourneyTabs
        batchCount={1500}
        current="workspace"
        journeyId="j"
        publicPaths={null}
      />,
    )
    expect(screen.getByTestId('batch-badge')).toHaveTextContent('99+')
  })
})
