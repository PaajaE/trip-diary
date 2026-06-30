import '@/app/i18n'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PublicSpacePage,
  type PublicSpaceViewModel,
} from '@/pages/public-space'

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
  standaloneEntries: [
    {
      dateLabel: '10. června 2026',
      excerpt: 'Naše osvědčené zastávky na cestu.',
      id: 'snacks',
      title: 'Svačiny na dlouhé přejezdy',
      typeLabel: 'Tip',
    },
  ],
}

const share = {
  shareText: 'Cestovní deník: Ečerovi\nhttps://example.com/ecerovi2016',
  shareUrl: 'https://example.com/ecerovi2016',
}

describe('PublicSpacePage', () => {
  afterEach(cleanup)

  it('presents public journeys and entries through callbacks', async () => {
    const user = userEvent.setup()
    const onOpenJourney = vi.fn()
    const onOpenEntry = vi.fn()
    render(
      <PublicSpacePage
        onOpenEntry={onOpenEntry}
        onOpenJourney={onOpenJourney}
        shareText={share.shareText}
        shareUrl={share.shareUrl}
        space={space}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Ečerovi' }),
    ).toBeVisible()
    expect(screen.getByText('@ecerovi2016')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /Kanada 2026/ }))
    expect(onOpenJourney).toHaveBeenCalledWith('canada')

    await user.click(
      screen.getByRole('button', { name: /Svačiny na dlouhé přejezdy/ }),
    )
    expect(onOpenEntry).toHaveBeenCalledWith('snacks')
  })

  it('shows independent empty states for journeys and entries', () => {
    render(
      <PublicSpacePage
        onOpenEntry={vi.fn()}
        onOpenJourney={vi.fn()}
        shareText={share.shareText}
        shareUrl={share.shareUrl}
        space={{ ...space, journeys: [], standaloneEntries: [] }}
      />,
    )

    expect(screen.getByText('Zatím žádné veřejné cesty')).toBeVisible()
    expect(screen.getByText('Zatím žádné veřejné příspěvky')).toBeVisible()
  })

  it('renders share actions for the public diary', () => {
    render(
      <PublicSpacePage
        onOpenEntry={vi.fn()}
        onOpenJourney={vi.fn()}
        shareText={share.shareText}
        shareUrl={share.shareUrl}
        space={space}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Sdílet na WhatsApp' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Kopírovat odkaz' }),
    ).toBeVisible()
  })
})
