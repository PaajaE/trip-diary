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

import { JourneyReaderClosingSection } from '@/features/journeys/ui/JourneyReaderClosingSection'

describe('JourneyReaderClosingSection', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the journal invitation without requiring comments', () => {
    render(
      <JourneyReaderClosingSection
        shareUrl="https://example.test/trip"
        spaceHandle="family"
        title="Summer trip"
      />,
    )

    expect(
      screen.getByRole('heading', {
        name: /Save your travel memories|Uložte si cestovní vzpomínky/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: /Create a free account|Vytvořit účet zdarma/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Visit @family|Navštívit @family/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/required to comment|nutné pro koment/i),
    ).toBeNull()
  })
})
