import { describe, expect, it } from 'vitest'
import { resolveAuthNavigation } from '@/foundation/navigation/auth-guard'

describe('resolveAuthNavigation', () => {
  it('waits while auth is loading', () => {
    expect(
      resolveAuthNavigation({
        authLoading: true,
        guard: 'app',
        session: null,
      }),
    ).toEqual({ type: 'loading' })
  })

  it('redirects unauthenticated users away from app routes', () => {
    expect(
      resolveAuthNavigation({
        authLoading: false,
        guard: 'app',
        session: null,
      }),
    ).toEqual({ type: 'redirect', href: '/sign-in' })
  })

  it('redirects authenticated users away from auth routes', () => {
    expect(
      resolveAuthNavigation({
        authLoading: false,
        guard: 'auth',
        session: { user: { id: 'user-1' } },
      }),
    ).toEqual({ type: 'redirect', href: '/' })
  })

  it('allows authenticated app navigation', () => {
    expect(
      resolveAuthNavigation({
        authLoading: false,
        guard: 'app',
        session: { user: { id: 'user-1' } },
      }),
    ).toEqual({ type: 'render' })
  })

  it('allows unauthenticated auth navigation', () => {
    expect(
      resolveAuthNavigation({
        authLoading: false,
        guard: 'auth',
        session: null,
      }),
    ).toEqual({ type: 'render' })
  })
})
