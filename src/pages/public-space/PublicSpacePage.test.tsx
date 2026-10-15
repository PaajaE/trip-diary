import '@/app/i18n'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PublicSpacePage,
  type PublicSpaceViewModel,
} from '@/pages/public-space'

function renderPublicSpacePage(props: ComponentProps<typeof PublicSpacePage>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PublicSpacePage {...props} />
    </QueryClientProvider>,
  )
}

const space: PublicSpaceViewModel = {
  bio: 'Cestujeme pomalu, ochutnáváme všechno.',
  handle: 'ecerovi2016',
  journeys: [
    {
      dateLabel: 'Květen až srpen 2026',
      id: 'canada',
      statusLabel: 'Právě cestujeme',
      summary: 'Jedno léto napříč Kanadou.',
      title: 'Kanada 2026',
    },
  ],
  name: 'Ečerovi',
}

const share = {
  shareText: 'Cestovní deník: Ečerovi\nhttps://example.com/ecerovi2016',
  shareUrl: 'https://example.com/ecerovi2016',
}

describe('PublicSpacePage', () => {
  afterEach(cleanup)

  it('presents public journeys through callbacks', async () => {
    const user = userEvent.setup()
    const onOpenJourney = vi.fn()
    renderPublicSpacePage({
      onOpenJourney,
      shareText: share.shareText,
      shareUrl: share.shareUrl,
      space,
    })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ečerovi' }),
    ).toBeVisible()
    expect(screen.getByText('Cestovní deník')).toBeVisible()
    expect(screen.getByText('@ecerovi2016')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Kanada 2026/ }))
    expect(onOpenJourney).toHaveBeenCalledWith('canada')
  })

  it('shows an empty state for journeys', () => {
    renderPublicSpacePage({
      onOpenJourney: vi.fn(),
      shareText: share.shareText,
      shareUrl: share.shareUrl,
      space: { ...space, journeys: [] },
    })

    expect(screen.getByText('Zatím žádné veřejné cesty')).toBeVisible()
  })

  it('renders a compact share action for the public diary', () => {
    renderPublicSpacePage({
      onOpenJourney: vi.fn(),
      shareText: share.shareText,
      shareUrl: share.shareUrl,
      space,
    })

    expect(screen.getByRole('button', { name: 'Sdílet' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Sdílet na WhatsApp' }),
    ).not.toBeInTheDocument()
  })
})
