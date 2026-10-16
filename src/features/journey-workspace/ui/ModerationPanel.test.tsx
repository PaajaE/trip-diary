import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'

// No router is mounted: render the link target as a plain anchor.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

const ID = '00000000-0000-4000-8000-000000000001'
const repo = vi.hoisted(() => ({
  getJourneyPublicPath: vi.fn(),
  listPendingComments: vi.fn(),
  moderateComment: vi.fn(),
}))
vi.mock(
  '@/entities/public-engagement/api/public-engagement.repository',
  () => repo,
)

const { ModerationPanel } =
  await import('@/features/journey-workspace/ui/ModerationPanel')

const pending = [
  {
    body: 'Čeká na tebe',
    createdAt: '2026-10-14T10:00:00+00:00',
    guestName: 'Eva',
    id: ID,
    target: { id: ID, type: 'moment' },
  },
]

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ModerationPanel
        journeyId="j1"
        titles={new Map([[ID, 'Jezero Louise']])}
      />
    </QueryClientProvider>,
  )
}

describe('ModerationPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    for (const fn of Object.values(repo)) fn.mockReset()
    repo.getJourneyPublicPath.mockResolvedValue({
      journeySlug: 'kanada',
      spaceHandle: 'ecerovi',
    })
  })
  afterEach(() => {
    cleanup()
  })

  it('renders nothing without pending comments', async () => {
    repo.listPendingComments.mockResolvedValue([])
    const { container } = setup()
    await waitFor(() => {
      expect(repo.listPendingComments).toHaveBeenCalled()
    })
    expect(container.textContent).toBe('')
  })

  it('lists pending comments with a link to the public target and approves optimistically', async () => {
    repo.listPendingComments.mockResolvedValue(pending)
    repo.moderateComment.mockResolvedValue(undefined)
    setup()
    // Collapsed by default: only the bar with the count is visible.
    const toggle = await screen.findByRole('button', { expanded: false })
    expect(toggle.textContent).toContain('1')
    expect(screen.queryByText('Čeká na tebe')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(await screen.findByText('Čeká na tebe')).toBeTruthy()
    expect(screen.getByText(/Jezero Louise/)).toBeTruthy()
    await waitFor(() => {
      expect(
        screen
          .getByRole('link', { name: 'View on the public page' })
          .getAttribute('href'),
      ).toBe(`/ecerovi/kanada/m/${ID}`)
    })
    repo.listPendingComments.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => {
      expect(screen.queryByText('Čeká na tebe')).toBeNull()
    })
    expect(repo.moderateComment).toHaveBeenCalledWith(ID, 'approved')
  })

  it('brings the comment back and shows an error when rejecting fails', async () => {
    repo.listPendingComments.mockResolvedValue(pending)
    repo.moderateComment.mockRejectedValue(new Error('nope'))
    setup()
    fireEvent.click(await screen.findByRole('button', { expanded: false }))
    await screen.findByText('Čeká na tebe')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'could not be loaded or saved',
    )
    expect(await screen.findByText('Čeká na tebe')).toBeTruthy()
  })
})
