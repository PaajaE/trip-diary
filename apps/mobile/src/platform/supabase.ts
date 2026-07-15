import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mobilePublicEnv } from '@/platform/env'

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (client !== null) {
    return client
  }

  const { supabaseAnonKey, supabaseUrl } = mobilePublicEnv
  if (supabaseUrl === undefined || supabaseAnonKey === undefined) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: AsyncStorage,
    },
  })

  return client
}

export function isSupabaseConfigured(): boolean {
  return (
    mobilePublicEnv.supabaseUrl !== undefined &&
    mobilePublicEnv.supabaseAnonKey !== undefined
  )
}
