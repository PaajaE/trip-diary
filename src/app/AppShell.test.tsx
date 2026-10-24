import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { AppShell } from '@/app/AppShell'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    onClick,
    role,
    className,
  }: {
    children: ReactNode
    className?: string
    onClick?: () => void
    role?: string
  }) => (
    <a
      className={className}
      href="/somewhere"
      role={role}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: () => '/dashboard',
}))
vi.mock('@/features/auth/session', () => ({
  useSession: () => ({
    loading: false,
    profile: {
      avatarUrl: null,
      displayName: 'Ada',
      username: 'ada',
    },
    signOut: () => Promise.resolve(),
    user: { email: 'ada@example.com', id: 'u1' },
  }),
}))
vi.mock('@/features/sync/ui/SyncStatusControl', () => ({
  SyncStatusControl: () => null,
}))

function renderShell() {
  return render(
    <AppShell>
      <button type="button">After menu</button>
    </AppShell>,
  )
}

describe('AccountMenu keyboard behaviour', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(cleanup)

  async function openMenu() {
    const user = userEvent.setup()
    renderShell()
    const trigger = screen.getByRole('button', { name: /^Account: Ada/ })
    await user.click(trigger)
    return { trigger, user }
  }

  it('exposes menuitems and focuses the first one on open', async () => {
    await openMenu()
    const items = screen.getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Dashboard',
      'Public profile',
      'Profile settings',
      'Family spaces',
      'Tips',
      'Sign out',
    ])
    expect(document.activeElement).toBe(items[0])
  })

  it('moves focus with arrows, Home and End (wrapping)', async () => {
    const { user } = await openMenu()
    const items = screen.getAllByRole('menuitem')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[1])
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(items[items.length - 1])
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[0])
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(items[items.length - 1])
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(items[0])
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const { trigger, user } = await openMenu()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Tab', async () => {
    const { user } = await openMenu()
    await user.tab()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
