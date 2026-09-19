import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from '@supabase/supabase-js'

export interface TripDiaryAuthOptions {
  autoRefreshToken?: boolean
  detectSessionInUrl?: boolean
  persistSession?: boolean
  storage?: SupportedStorage
}

export interface TripDiaryClientOptions {
  auth?: TripDiaryAuthOptions
  supabaseAnonKey: string
  supabaseUrl: string
}

/**
 * Platform-neutral Supabase client factory for web and mobile.
 * Pass auth.storage (e.g. AsyncStorage) on React Native; omit on web.
 */
export function createTripDiaryClient<Database = unknown>(
  options: TripDiaryClientOptions,
): SupabaseClient<Database> {
  const auth = options.auth

  return createClient<Database>(options.supabaseUrl, options.supabaseAnonKey, {
    auth: {
      autoRefreshToken: auth?.autoRefreshToken ?? true,
      detectSessionInUrl: auth?.detectSessionInUrl ?? true,
      persistSession: auth?.persistSession ?? true,
      ...(auth?.storage === undefined ? {} : { storage: auth.storage }),
    },
  })
}

export type { SupabaseClient, SupportedStorage }
