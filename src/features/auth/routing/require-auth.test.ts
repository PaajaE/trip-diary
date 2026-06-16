import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAuth } from '@/features/auth/routing/require-auth'
import { getSupabaseClient } from '@/shared/api/supabase'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

const getSession = vi.fn()

describe('requireAuth', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: { getSession },
    } as never)
    getSession.mockReset()
    sessionStorage.clear()
  })

  it('allows navigation when a session exists', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: crypto.randomUUID() } } },
      error: null,
    })

    await expect(
      requireAuth({
        location: { pathname: '/dashboard', searchStr: '' },
      }),
    ).resolves.toBeUndefined()
  })

  it('stores the return path and redirects when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect(
      requireAuth({
        location: { pathname: '/dashboard', searchStr: '?tab=journeys' },
      }),
    ).rejects.toMatchObject({
      options: { to: '/sign-in' },
    })
    expect(sessionStorage.getItem('trip-diary.auth-return')).toBe(
      '/dashboard?tab=journeys',
    )
  })
})
