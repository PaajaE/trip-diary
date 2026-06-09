import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/api/database.types'
import { publicEnv } from '@/shared/config/env'

const supabase =
  publicEnv.VITE_SUPABASE_URL === undefined ||
  publicEnv.VITE_SUPABASE_ANON_KEY === undefined
    ? null
    : createClient<Database>(
        publicEnv.VITE_SUPABASE_URL,
        publicEnv.VITE_SUPABASE_ANON_KEY,
      )

export function getSupabaseClient() {
  if (supabase === null) {
    throw new Error('Supabase is not configured')
  }

  return supabase
}
