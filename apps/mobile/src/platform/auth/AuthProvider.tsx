import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useSessionRestore } from '@/foundation/auth/use-session-restore'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import type { Session, User } from '@supabase/supabase-js'

interface AuthContextValue {
  isLoading: boolean
  session: Session | null
  signOut: () => Promise<void>
  user: User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoading, session } = useSessionRestore({
    getClient: getSupabaseClient,
    isConfigured: isSupabaseConfigured,
  })

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      session,
      signOut: async () => {
        if (!isSupabaseConfigured()) {
          return
        }
        await getSupabaseClient().auth.signOut()
      },
      user: session?.user ?? null,
    }),
    [isLoading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
