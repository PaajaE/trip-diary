import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import type * as Repository from '@/entities/public-engagement/api/public-engagement.repository'
import i18n from 'i18next'
import {
  SessionContext,
  type SessionContextValue,
} from '@/features/auth/session/session-context'
import { PublicEngagementScope } from '@/features/public-engagement/lib/scope'

const ID = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-0000000000aa'
const target = { id: ID, type: 'moment' } as const

const repo = vi.hoisted(() => ({
  addComment: vi.fn(),
  addHeart: vi.fn(),
  getMyHearts: vi.fn(),
  getMyPendingComments: vi.fn(),
  getPublicEngagement: vi.fn(),
  removeHeart: vi.fn(),
}))
vi.mock(
  '@/entities/public-engagement/api/public-engagement.repository',
  async (importOriginal) => ({
    ...(await importOriginal<typeof Repository>()),
    ...repo,
  }),
)
const ensureGuestSession = vi.hoisted(() => vi.fn())
vi.mock('@/features/auth/api/guest-session', () => ({ ensureGuestSession }))

const { TargetEngagement } =
  await import('@/features/public-engagement/ui/CommentsSection')

const guest = { id: USER, is_anonymous: true } as User

function wrap(user: User | null) {
  const session = { user } as SessionContextValue
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <SessionContext.Provider value={session}>
          <PublicEngagementScope journeySlug="kanada" spaceHandle="ecerovi">
            {children}
          </PublicEngagementScope>
        </SessionContext.Provider>
      </QueryClientProvider>
    )
  }
}

function setup(user: User | null = null) {
  return render(<TargetEngagement target={target} />, { wrapper: wrap(user) })
}

describe('TargetEngagement', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    window.localStorage.clear()
    for (const fn of Object.values(repo)) fn.mockReset()
    ensureGuestSession.mockReset()
    ensureGuestSession.mockResolvedValue(guest)
    repo.getPublicEngagement.mockResolvedValue({
      comments: [
        {
          body: 'Krásné místo',
          createdAt: '2026-10-14T10:00:00+00:00',
          id: ID,
          name: 'Eva',
          targetId: ID,
          targetType: 'moment',
        },
      ],
      hearts: [{ count: 3, targetId: ID, targetType: 'moment' }],
    })
    repo.getMyHearts.mockResolvedValue([])
    repo.getMyPendingComments.mockResolvedValue([])
  })
  afterEach(() => {
    cleanup()
  })

  it('does not create a guest session on render, only fetches engagement once idle', async () => {
    setup()
    expect(await screen.findByText('Krásné místo')).toBeTruthy()
    expect(repo.getPublicEngagement).toHaveBeenCalledTimes(1)
    expect(ensureGuestSession).not.toHaveBeenCalled()
    expect(screen.getByTestId('heart-count').textContent).toBe('3')
  })

  it('hearts optimistically', async () => {
    let finish: () => void = () => undefined
    repo.addHeart.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    setup(guest)
    await screen.findByText('Krásné místo')
    fireEvent.click(screen.getByRole('button', { name: /^Like/ }))
    await waitFor(() => {
      expect(screen.getByTestId('heart-count').textContent).toBe('4')
    })
    expect(repo.addHeart).toHaveBeenCalledWith(target, USER)
    finish()
    await waitFor(() => {
      expect(
        screen
          .getByRole('button', { name: /^Like/ })
          .getAttribute('aria-pressed'),
      ).toBe('true')
    })
  })

  it('rolls the heart back and explains when the DB rate limit hits', async () => {
    const { EngagementError } =
      await import('@/entities/public-engagement/api/public-engagement.repository')
    repo.addHeart.mockRejectedValue(new EngagementError('rate_limited'))
    setup()
    await screen.findByText('Krásné místo')
    fireEvent.click(screen.getByRole('button', { name: /^Like/ }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Too many attempts',
    )
    expect(screen.getByTestId('heart-count').textContent).toBe('3')
    expect(
      screen
        .getByRole('button', { name: /^Like/ })
        .getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('submits a guest comment, remembers the name and shows the approval notice', async () => {
    repo.addComment.mockResolvedValue(undefined)
    setup()
    await screen.findByText('Krásné místo')
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Eva ' },
    })
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'Super' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
    expect((await screen.findByRole('status')).textContent).toContain(
      'waiting for the author',
    )
    expect(repo.addComment).toHaveBeenCalledWith({
      body: 'Super',
      guestName: 'Eva',
      target,
      userId: USER,
    })
    expect(window.localStorage.getItem('trip-diary:guest-name')).toBe('Eva')
  })

  it('disables the form while submitting and blocks empty input', async () => {
    let finish: () => void = () => undefined
    repo.addComment.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    setup()
    await screen.findByText('Krásné místo')
    const send = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Send comment',
    })
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'E' } })
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'x' },
    })
    fireEvent.click(send)
    await waitFor(() => {
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Sending…' })
          .disabled,
      ).toBe(true)
    })
    finish()
    await screen.findByRole('status')
  })

  it('sends nothing when the honeypot is filled', async () => {
    setup()
    await screen.findByText('Krásné místo')
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'E' } })
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'x' },
    })
    fireEvent.change(screen.getByLabelText('Website'), {
      target: { value: 'http://spam' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
    await screen.findByRole('status')
    expect(repo.addComment).not.toHaveBeenCalled()
    expect(ensureGuestSession).not.toHaveBeenCalled()
  })

  it('shows the own pending comment with a label', async () => {
    repo.getMyPendingComments.mockResolvedValue([
      {
        body: 'Moje čekající',
        createdAt: '2026-10-14T11:00:00+00:00',
        guestName: 'Eva',
        id: '00000000-0000-4000-8000-000000000002',
        target,
      },
    ])
    setup(guest)
    expect(await screen.findByText('Moje čekající')).toBeTruthy()
    expect(screen.getByText('Waiting for approval')).toBeTruthy()
  })

  it('registered users comment without a name field', async () => {
    repo.addComment.mockResolvedValue(undefined)
    ensureGuestSession.mockResolvedValue({ id: USER })
    setup({ id: USER } as User)
    await screen.findByText('Krásné místo')
    expect(screen.queryByLabelText('Name')).toBeNull()
    fireEvent.change(screen.getByLabelText('Comment'), {
      target: { value: 'Hi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send comment' }))
    await screen.findByText('Comment added.')
    expect(repo.addComment.mock.calls[0]?.[0]).not.toHaveProperty('guestName')
  })
})
