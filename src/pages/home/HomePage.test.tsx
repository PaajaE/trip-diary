import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { i18n } from '@/app/i18n'
import type { SessionContextValue } from '@/features/auth/session'

const sessionState = vi.hoisted(() => ({
  value: null as unknown as SessionContextValue,
}))

vi.mock('@/features/auth/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => sessionState.value,
}))

function session(user: { email: string } | null): SessionContextValue {
  return {
    error: null,
    loading: false,
    profile: null,
    refreshProfile: () => Promise.resolve(),
    session: null,
    signOut: () => Promise.resolve(),
    user: user as SessionContextValue['user'],
  }
}

describe('HomePage', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    sessionState.value = session(null)
    await i18n.changeLanguage('cs')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the Czech landing page for signed-out visitors', async () => {
    render(<App />)

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Každá cesta, na mapě i v příběhu.',
      }),
    ).toBeVisible()
    const main = screen.getByRole('main')
    expect(
      within(main).getAllByRole('link', { name: 'Přihlásit se' })[0],
    ).toHaveAttribute('href', '/sign-in')
    expect(within(main).getByText('Ukázková cesta')).toBeVisible()
    for (const name of [
      'Jak to funguje',
      'Pořádek, který se skládá sám',
      'Mapa je základ, čas je osa',
      'Pro koho to je',
    ]) {
      expect(
        within(main).getByRole('heading', { level: 2, name }),
      ).toBeVisible()
    }
    expect(screen.getByRole('img', { name: /Ilustrace trasy/ })).toBeVisible()
    expect(document.title).toBe(
      'Cestovní deník – mapa, fotky a příběh každé cesty',
    )
    expect(document.documentElement.lang).toBe('cs')
  })

  it('marks unfinished features as coming soon', async () => {
    render(<App />)

    await screen.findByRole('heading', { level: 1 })
    expect(screen.getAllByText('Připravujeme').length).toBeGreaterThan(3)
  })

  it('shows the project vocabulary in the structure example', async () => {
    render(<App />)

    await screen.findByRole('heading', { level: 1 })
    const example = screen.getByRole('figure', {
      name: 'Ukázka struktury cesty',
    })
    for (const kind of ['Cesta', 'Etapa', 'Výlet', 'Moment', 'Fotka / Video']) {
      expect(within(example).getAllByText(kind).length).toBeGreaterThan(0)
    }
  })

  it('offers trip creation to signed-in users', async () => {
    sessionState.value = session({ email: 'a@example.test' })
    render(<App />)

    const main = await screen.findByRole('main')
    expect(
      within(main).getAllByRole('link', { name: 'Vytvořit cestu' })[0],
    ).toHaveAttribute('href', '/journeys/new')
    expect(
      within(main).getByRole('link', { name: 'Moje cesty' }),
    ).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('group', { name: 'Jazyk' })).toBeNull()
  })

  it('switches to English and remembers the choice', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { level: 1 })
    const [headerSwitcher] = screen.getAllByRole('group', { name: 'Jazyk' })
    expect(headerSwitcher).toBeDefined()
    await user.click(
      within(headerSwitcher!).getByRole('button', { name: 'en' }),
    )

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Every journey, on the map and in the story.',
      }),
    ).toBeVisible()
    expect(
      within(screen.getByRole('main')).getAllByRole('link', {
        name: 'Sign in',
      })[0],
    ).toBeVisible()
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(3)
    expect(
      screen.getByRole('banner').querySelector('a[href="/"]'),
    ).toHaveTextContent('Trip Diary')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe(
      'Trip Diary – every journey on the map and in the story',
    )
    expect(window.localStorage.getItem('trip-diary.locale')).toBe('en')
  })
})
