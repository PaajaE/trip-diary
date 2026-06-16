import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { CurrentProfile } from '@/entities/profile/model/profile'

export interface SessionContextValue {
  error: Error | null
  loading: boolean
  profile: CurrentProfile | null
  refreshProfile: () => Promise<void>
  session: Session | null
  signOut: () => Promise<void>
  user: User | null
}

export const SessionContext = createContext<SessionContextValue | null>(null)
