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
import { signOut as requestSignOut } from '@/features/auth/api/auth.service'
import { getSupabaseClient } from '@/shared/api/supabase'
import {
  SessionContext,
  type SessionContextValue,
} from '@/features/auth/session/session-context'
import { getCachedProfile } from '@/entities/profile/api/local-profile-cache.repository'
import { loadCurrentProfile } from '@/features/auth/session/load-current-profile'

interface SessionState {
  error: Error | null
  loading: boolean
  profile: CurrentProfile | null
  session: Session | null
}

const initialState: SessionState = {
  error: null,
  loading: true,
  profile: null,
  session: null,
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unable to load session')
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>(initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const refreshProfile = useCallback(async () => {
    const userId = state.session?.user.id
    if (userId === undefined) {
      return
    }

    const profile = await loadCurrentProfile(userId)
    setState((current) =>
      current.session?.user.id === userId
        ? { ...current, error: null, profile }
        : current,
    )
  }, [state.session?.user.id])

  useEffect(() => {
    let client: ReturnType<typeof getSupabaseClient>
    try {
      client = getSupabaseClient()
    } catch (error) {
      queueMicrotask(() => {
        setState({
          error: toError(error),
          loading: false,
          profile: null,
          session: null,
        })
      })
      return
    }

    let active = true
    let authEventReceived = false
    let revision = 0

    const applySession = async (session: Session | null) => {
      const currentRevision = ++revision

      if (session === null) {
        setState({ error: null, loading: false, profile: null, session: null })
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

    return () => {
      active = false
      revision += 1
      subscription.unsubscribe()
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
