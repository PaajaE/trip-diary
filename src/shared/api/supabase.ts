import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/api/database.types'
import { publicEnv } from '@/shared/config/env'

const supabase =
  publicEnv.supabaseUrl === undefined ||
  publicEnv.supabaseAnonKey === undefined
    ? null
    : createClient<Database>(
        publicEnv.supabaseUrl,
        publicEnv.supabaseAnonKey,
      )

export function getSupabaseClient() {
  if (supabase === null) {
    throw new Error('Supabase is not configured')
  }

  return supabase
}
