import { cleanup, render, screen } from '@testing-library/react'
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
    to: string
  }) => (
    <a aria-current={rest['aria-current']} className={rest.className} href={to}>
      {children}
    </a>
  ),
}))

describe('JourneyTabs', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('marks only the current tab with aria-current', () => {
    render(<JourneyTabs current="import" journeyId="j" publicPaths={null} />)
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Workspace' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(screen.getByRole('link', { name: 'Members' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Quick note' })).toBeTruthy()
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
    expect(screen.getByRole('link', { name: 'Batch' })).toHaveAttribute(
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
      screen.getByRole('link', { name: /Batch.*12 waiting to be sorted/ }),
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
