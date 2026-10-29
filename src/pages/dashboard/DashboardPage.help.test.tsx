import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { JourneyProgress } from '@/entities/dashboard/api/journey-progress.repository'
import type { DashboardJourneyCard } from '@/entities/dashboard/model/dashboard'
import { ContinueTripHero, JourneyCard } from '@/pages/dashboard/DashboardPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: ReactNode
    className?: string
    to: string
  }) => (
    <a className={rest.className} href={to}>
      {children}
    </a>
  ),
}))

const ID = '11111111-1111-4111-8111-111111111111'

const journey = {
  endsAt: null,
  id: ID,
  role: 'owner',
  startsAt: null,
  status: 'active',
  summary: '',
  title: 'Island',
  updatedAt: '2026-10-01T10:00:00.000Z',
  visibility: 'private',
} as unknown as DashboardJourneyCard

function progress(patch: Partial<JourneyProgress>): JourneyProgress {
  return {
    coverMediaId: null,
    daysTotal: 5,
    daysWithNote: 5,
    journeyId: ID,
    mediaTotal: 10,
    mediaUnreviewed: 0,
    starred: 0,
    ...patch,
  }
}

function hero(map: Map<string, JourneyProgress> | undefined) {
  return render(<ContinueTripHero journeys={[journey]} progress={map} />)
}

describe('ContinueTripHero', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('leads to sorting when photos wait, with Czech plural forms', async () => {
    for (const [count, headline] of [
      [1, 'Roztřídit 1 fotku'],
      [3, 'Roztřídit 3 fotky'],
      [12, 'Roztřídit 12 fotek'],
    ] as const) {
      const { unmount } = hero(
        new Map([[ID, progress({ mediaUnreviewed: count, daysWithNote: 1 })]]),
      )
      expect(screen.getByRole('heading', { name: headline })).toBeTruthy()
      expect(
        screen.getByRole('link', { name: 'Otevřít třídění' }),
      ).toHaveAttribute('href', '/j/$journeyId/batch')
      expect(screen.getByRole('link', { name: 'Rychlý zápis' })).toBeTruthy()
      unmount()
    }
    await i18n.changeLanguage('en')
    hero(new Map([[ID, progress({ mediaUnreviewed: 1 })]]))
    expect(screen.getByRole('heading', { name: 'Sort 1 photo' })).toBeTruthy()
  })

  it('asks for a day note when nothing waits but a day has none', () => {
    hero(new Map([[ID, progress({ daysWithNote: 3 })]]))
    expect(
      screen.getByRole('heading', { name: 'Napsat zápis dne' }),
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Otevřít cestu' })).toHaveAttribute(
      'href',
      '/j/$journeyId',
    )
    expect(screen.getByText(/Napsat jednu větu ke 2 dnům/)).toBeTruthy()
  })

  it('falls back to "continue" when all is done or progress is unavailable', () => {
    const { unmount } = hero(new Map([[ID, progress({})]]))
    expect(
      screen.getByRole('link', { name: /Pokračovat v cestě/ }),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Island' })).toBeTruthy()
    unmount()
    // RPC absent or failed: the progress map is undefined.
    hero(undefined)
    expect(
      screen.getByRole('link', { name: /Pokračovat v cestě/ }),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Otevřít třídění' })).toBeNull()
  })

  it('ignores progress of a journey that is still pending sync', () => {
    render(
      <ContinueTripHero
        journeys={[{ ...journey, syncStatus: 'pending' }]}
        progress={new Map([[ID, progress({ mediaUnreviewed: 4 })]])}
      />,
    )
    expect(
      screen.getByRole('link', { name: /Pokračovat v cestě/ }),
    ).toBeTruthy()
  })
})

describe('JourneyCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('shows cover, to-sort badge and a progress line', () => {
    render(
      <JourneyCard
        cover={{
          kind: 'photo',
          variants: [
            {
              byteSize: 1,
              createdAt: '2026-10-01T10:00:00.000Z',
              height: 10,
              kind: 'thumb',
              mediaId: ID,
              mimeType: 'image/jpeg',
              storageKey: 'a/thumb.jpg',
              width: 10,
            },
          ],
        }}
        journey={journey}
        progress={progress({ daysWithNote: 2, mediaUnreviewed: 9 })}
      />,
    )
    expect(
      screen.getByTestId('journey-card-cover').getAttribute('src'),
    ).toMatch(/a\/thumb\.jpg$/)
    expect(screen.getByTestId('journey-card-to-sort')).toHaveTextContent(
      '9 k roztřídění',
    )
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '5')
  })

  it('renders plainly without progress (pending journey, failed RPC)', () => {
    render(
      <JourneyCard
        cover={undefined}
        journey={{ ...journey, syncStatus: 'pending' }}
        progress={undefined}
      />,
    )
    expect(screen.getByText('Čeká na synchronizaci')).toBeTruthy()
    expect(screen.queryByTestId('journey-card-cover')).toBeNull()
    expect(screen.queryByTestId('journey-card-to-sort')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
