import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

interface UseSessionRestoreOptions {
  getClient: () => SupabaseClient
  isConfigured: () => boolean
}

interface SessionRestoreState {
  isLoading: boolean
  session: Session | null
}

/**
 * Foundation auth lifecycle hook.
 *
 * AuthProvider delegates initial session hydration and auth-state
 * subscription to this hook. Keeps platform wiring in AuthProvider while
 * documenting the restore pattern for future native session storage work.
 */
export function useSessionRestore({
  getClient,
  isConfigured,
}: UseSessionRestoreOptions): SessionRestoreState {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isConfigured()) {
      setIsLoading(false)
      return
    }

    const supabase = getClient()
    let isMounted = true

    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session)
        setIsLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [getClient, isConfigured])

  return { isLoading, session }
}
