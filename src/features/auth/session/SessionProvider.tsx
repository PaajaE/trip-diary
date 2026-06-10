import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Profile } from '@/entities/profile/model/profile'
import { signOut as requestSignOut } from '@/features/auth/api/auth.service'
import { getSupabaseClient } from '@/shared/api/supabase'
import {
  SessionContext,
  type SessionContextValue,
} from '@/features/auth/session/session-context'
import { loadCurrentProfile } from '@/features/auth/session/load-current-profile'

interface SessionState {
  error: Error | null
  loading: boolean
  profile: Profile | null
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

  useEffect(() => {
    const client = getSupabaseClient()
    let active = true
    let authEventReceived = false
    let revision = 0

    const applySession = async (session: Session | null) => {
      const currentRevision = ++revision

      setState({
        error: null,
        loading: session !== null,
        profile: null,
        session,
      })

      if (session === null) {
        return
      }

      try {
        const profile = await loadCurrentProfile(session.user.id)

        if (active && currentRevision === revision) {
          setState({ error: null, loading: false, profile, session })
        }
      } catch (error) {
        if (active && currentRevision === revision) {
          setState({
            error: toError(error),
            loading: false,
            profile: null,
            session,
          })
        }
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true
      queueMicrotask(() => {
        if (active) {
          void applySession(session)
        }
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
      signOut: requestSignOut,
      user: state.session?.user ?? null,
    }),
    [state],
  )

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  )
}
