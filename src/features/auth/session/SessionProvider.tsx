import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type { CurrentProfile } from '@/entities/profile/model/profile'
import {
  SessionContext,
  type SessionContextValue,
} from '@/features/auth/session/session-context'

// Supabase, Dexie and the profile loader are imported on demand so the landing
// page can paint without waiting for them.
const loadSessionRuntime = () =>
  Promise.all([
    import('@/shared/api/supabase'),
    import('@/features/auth/session/load-current-profile'),
    import('@/entities/profile/api/local-profile-cache.repository'),
  ]).then(([supabase, profile, cache]) => ({
    getCachedProfile: cache.getCachedProfile,
    getSupabaseClient: supabase.getSupabaseClient,
    loadCurrentProfile: profile.loadCurrentProfile,
  }))

type SessionRuntime = Awaited<ReturnType<typeof loadSessionRuntime>>

const requestSignOut = () =>
  import('@/features/auth/api/auth.service').then(({ signOut }) => signOut())

interface SessionState {
  error: Error | null
  loading: boolean
  profile: CurrentProfile | null
  session: Session | null
}

/**
 * Without a persisted Supabase session (or an auth callback in the URL) a visitor
 * is signed out for sure, so the UI can render that state immediately and the
 * auth runtime can load once the browser is idle.
 */
function mayHaveSession(): boolean {
  try {
    const { hash, search } = window.location
    if (
      /access_token|[?&]code=|token_hash|error_description/.test(hash + search)
    ) {
      return true
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
      if (/^sb-.+-auth-token/.test(window.localStorage.key(index) ?? '')) {
        return true
      }
    }
    return false
  } catch {
    return true
  }
}

function runWhenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, { timeout: 2000 })
    return () => {
      window.cancelIdleCallback(handle)
    }
  }
  const handle = window.setTimeout(callback, 0)
  return () => {
    window.clearTimeout(handle)
  }
}

function createInitialState(): SessionState {
  return {
    error: null,
    loading: mayHaveSession(),
    profile: null,
    session: null,
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unable to load session')
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>(createInitialState)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const refreshProfile = useCallback(async () => {
    const userId = state.session?.user.id
    if (userId === undefined) {
      return
    }

    const { loadCurrentProfile } = await loadSessionRuntime()
    const profile = await loadCurrentProfile(userId)
    setState((current) =>
      current.session?.user.id === userId
        ? { ...current, error: null, profile }
        : current,
    )
  }, [state.session?.user.id])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    let authEventReceived = false
    let revision = 0

    const boot = (runtime: SessionRuntime) => {
      const { getCachedProfile, getSupabaseClient, loadCurrentProfile } =
        runtime
      let client: ReturnType<typeof getSupabaseClient>
      try {
        client = getSupabaseClient()
      } catch (error) {
        setState({
          error: toError(error),
          loading: false,
          profile: null,
          session: null,
        })
        return
      }

      const applySession = async (session: Session | null) => {
        const currentRevision = ++revision

        if (session === null) {
          setState({
            error: null,
            loading: false,
            profile: null,
            session: null,
          })
          return
        }

        const current = stateRef.current
        const sameUser = current.session?.user.id === session.user.id
        if (sameUser && current.profile !== null) {
          setState({ ...current, error: null, loading: false, session })
          return
        }

        setState({
          error: null,
          loading: true,
          profile: sameUser ? current.profile : null,
          session,
        })

        try {
          const profile = await loadCurrentProfile(session.user.id)

          if (active && currentRevision === revision) {
            setState({ error: null, loading: false, profile, session })
          }
        } catch (error) {
          if (active && currentRevision === revision) {
            const cachedProfile = await getCachedProfile(session.user.id)
            setState({
              error: cachedProfile === null ? toError(error) : null,
              loading: false,
              profile: cachedProfile,
              session,
            })
          }
        }
      }

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        authEventReceived = true
        queueMicrotask(() => {
          if (!active) {
            return
          }

          if (event === 'TOKEN_REFRESHED' && session !== null) {
            setState((current) =>
              current.session?.user.id === session.user.id
                ? { ...current, error: null, session }
                : current,
            )
            return
          }

          void applySession(session)
        })
      })

      void client.auth
        .getSession()
        .then(({ data, error }) => {
          if (error !== null) {
            throw error
          }

          if (active && !authEventReceived) {
            void applySession(data.session)
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setState({
              error: toError(error),
              loading: false,
              profile: null,
              session: null,
            })
          }
        })

      unsubscribe = () => {
        revision += 1
        subscription.unsubscribe()
      }
    }

    const start = () => {
      loadSessionRuntime()
        .then((runtime) => {
          if (active) boot(runtime)
        })
        .catch((error: unknown) => {
          if (active) {
            setState({
              error: toError(error),
              loading: false,
              profile: null,
              session: null,
            })
          }
        })
    }

    let cancelIdle: (() => void) | undefined
    if (mayHaveSession()) {
      start()
    } else {
      cancelIdle = runWhenIdle(start)
    }

    return () => {
      active = false
      cancelIdle?.()
      unsubscribe?.()
    }
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      refreshProfile,
      signOut: requestSignOut,
      user: state.session?.user ?? null,
    }),
    [refreshProfile, state],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}
