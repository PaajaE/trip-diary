import { createTripDiaryClient } from '@trip-diary/api'
import type { Database } from '@/shared/api/database.types'
import { publicEnv } from '@/shared/config/env'

const supabase =
  publicEnv.supabaseUrl === undefined || publicEnv.supabaseAnonKey === undefined
    ? null
    : createTripDiaryClient<Database>({
        supabaseAnonKey: publicEnv.supabaseAnonKey,
        supabaseUrl: publicEnv.supabaseUrl,
      })

export function getSupabaseClient() {
  if (supabase === null) {
    throw new Error('Supabase is not configured')
  }

  return supabase
}
