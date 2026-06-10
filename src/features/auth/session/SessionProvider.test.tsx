import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import type {
  AuthChangeEvent,
  Session,
  Subscription,
} from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '@/shared/api/supabase'
import { loadCurrentProfile } from '@/features/auth/session/load-current-profile'
import { SessionProvider } from '@/features/auth/session/SessionProvider'
import { useSession } from '@/features/auth/session/use-session'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/features/auth/session/load-current-profile', () => ({
  loadCurrentProfile: vi.fn(),
}))

const userId = 'e7a8d51b-e975-46aa-965c-1d52c54fa119'
const session = {
  access_token: 'access-token',
  expires_in: 3600,
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  user: { id: userId },
} as Session

function createAuthClient(initialSession: Session | null) {
  let listener:
    | ((event: AuthChangeEvent, session: Session | null) => void)
    | undefined
  const unsubscribe = vi.fn()
  const signOut = vi.fn().mockResolvedValue({ error: null })

  vi.mocked(getSupabaseClient).mockReturnValue({
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: initialSession }, error: null }),
      onAuthStateChange: vi.fn(
        (
          callback: (event: AuthChangeEvent, session: Session | null) => void,
        ) => {
          listener = callback

          return {
            data: {
              subscription: { unsubscribe } as unknown as Subscription,
            },
          }
        },
      ),
      signOut,
    },
  } as unknown as ReturnType<typeof getSupabaseClient>)

  return {
    emit(event: AuthChangeEvent, nextSession: Session | null) {
      listener?.(event, nextSession)
    },
    signOut,
    unsubscribe,
  }
}

function wrapper({ children }: PropsWithChildren) {
  return <SessionProvider>{children}</SessionProvider>
}

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.mocked(loadCurrentProfile).mockReset()
    vi.mocked(getSupabaseClient).mockReset()
  })

  it('falls back to a signed-out state when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockImplementation(() => {
      throw new Error('Supabase is not configured')
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.user).toBeNull()
    expect(result.current.error?.message).toBe('Supabase is not configured')
  })

  it('loads the active session and its profile', async () => {
    createAuthClient(session)
    vi.mocked(loadCurrentProfile).mockResolvedValue({
      avatarUrl: null,
      bio: null,
      displayName: 'Ečerovi',
      id: userId,
      username: 'ecerovi2016',
    })

    const { result } = renderHook(() => useSession(), { wrapper })

    expect(result.current.loading).toBe(true)
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.user?.id).toBe(userId)
    expect(result.current.profile?.username).toBe('ecerovi2016')
  })

  it('reacts to sign-out and clears user-specific state', async () => {
    const client = createAuthClient(session)
    vi.mocked(loadCurrentProfile).mockResolvedValue({
      avatarUrl: null,
      bio: null,
      displayName: null,
      id: userId,
      username: 'ecerovi2016',
    })

    const { result } = renderHook(() => useSession(), { wrapper })
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      client.emit('SIGNED_OUT', null)
    })

    await waitFor(() => {
      expect(result.current.session).toBeNull()
    })
    expect(result.current.profile).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('exposes signOut and unsubscribes on unmount', async () => {
    const client = createAuthClient(null)
    const { result, unmount } = renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await act(async () => {
      await result.current.signOut()
    })
    expect(client.signOut).toHaveBeenCalledOnce()

    unmount()
    expect(client.unsubscribe).toHaveBeenCalledOnce()
  })

  it('refreshes the current profile on demand', async () => {
    createAuthClient(session)
    vi.mocked(loadCurrentProfile)
      .mockResolvedValueOnce({
        avatarUrl: null,
        bio: null,
        displayName: null,
        id: userId,
        username: 'ecerovi2016',
      })
      .mockResolvedValueOnce({
        avatarUrl: null,
        bio: null,
        displayName: 'Ečerovi',
        id: userId,
        username: 'ecerovi2016',
      })

    const { result } = renderHook(() => useSession(), { wrapper })
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await act(async () => {
      await result.current.refreshProfile()
    })

    expect(result.current.profile?.displayName).toBe('Ečerovi')
  })
})
