import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'

vi.mock('@/features/auth/session', () => ({
  useSession: () => ({ user: null }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/shared/lib/share', () => ({
  copyText: vi.fn(async () => undefined),
  shareUrl: vi.fn(async () => undefined),
}))

import { JourneyReaderClosingSection } from '@/features/journeys/ui/JourneyReaderClosingSection'

describe('JourneyReaderClosingSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders only supported actions', () => {
    render(
      <JourneyReaderClosingSection
        shareUrl="https://example.test/trip"
        spaceHandle="family"
        title="Summer trip"
      />,
    )

    expect(
      screen.getByRole('button', {
        name: /Share this trip|Sdílet tuto cestu/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Copy link|Kopírovat odkaz/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Visit @family|Navštívit @family/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: /Sign in \(optional\)|Přihlásit se \(volitelné\)/i,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/coming soon|již brzy/i)).not.toBeInTheDocument()
    expect(
      screen.queryByText(/follow this trip|sledovat cestu/i),
    ).not.toBeInTheDocument()
  })

  it('does not claim sign-in is required for commenting', () => {
    render(
      <JourneyReaderClosingSection
        shareUrl="https://example.test/trip"
        spaceHandle="family"
        title="Summer trip"
      />,
    )

    expect(
      screen.queryByText(/required to comment|nutné pro koment/i),
    ).toBeNull()
    expect(
      screen.getByText(/Chcete vidět víc\?|Want to see more\?/),
    ).toBeInTheDocument()
  })
})
