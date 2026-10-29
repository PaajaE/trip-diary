import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { ReaderBar } from '@/app/ReaderBar'

let pathname = '/ada/alaska'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
  }: {
    children: ReactNode
    params?: Record<string, string>
    to: string
  }) => {
    const href = to.replace(/\$(\w+)/g, (_, key: string) => params?.[key] ?? '')
    return <a href={href}>{children}</a>
  },
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string
  }) => select({ location: { pathname } }),
}))

function hrefs() {
  return screen.getAllByRole('link').map((link) => link.getAttribute('href'))
}

describe('ReaderBar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  it('goes from a trip up to the space and exits to the space when signed out', () => {
    pathname = '/ada/alaska'
    render(<ReaderBar signedIn={false} />)
    expect(hrefs()).toEqual(['/ada', '/ada'])
    expect(screen.getByText('Back to space')).toBeTruthy()
  })

  it('goes from a stop back to the trip and exits to the dashboard when signed in', () => {
    pathname = '/ada/alaska/m/m1'
    render(<ReaderBar signedIn />)
    expect(hrefs()).toEqual(['/ada/alaska', '/dashboard'])
    expect(screen.getByText('Back to trip')).toBeTruthy()
    expect(screen.getByText('Close')).toBeTruthy()
  })
})
