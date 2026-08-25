import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { JourneyReaderHero } from '@/features/journeys/ui/JourneyReaderHero'

const scrollToReaderSection = vi.fn()

vi.mock('@/features/journeys/lib/journey-reader-section', () => ({
  scrollToReaderSection: (...args: unknown[]) => scrollToReaderSection(...args),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={props.to}>{children}</a>
  ),
}))

describe('JourneyReaderHero', () => {
  afterEach(() => {
    cleanup()
    scrollToReaderSection.mockReset()
  })

  it('renders the trip title prominently without a date', () => {
    render(
      <JourneyReaderHero
        mapPointCount={3}
        momentCount={5}
        photoCount={12}
        summary="A coastal walk"
        title="Iceland Ring Road"
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Iceland Ring Road' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
  })

  it('scrolls to the trip stages section from the explore control', () => {
    render(
      <JourneyReaderHero
        mapPointCount={0}
        momentCount={1}
        photoCount={0}
        summary=""
        title="Weekend hike"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /Explore the journey|Prozkoumat cestu/i,
      }),
    )

    expect(scrollToReaderSection).toHaveBeenCalledWith('story')
  })
})
