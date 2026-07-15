import { parsePublicEnv, type PublicEnv } from '@trip-diary/config'

export function readVitePublicEnv(raw: Record<string, unknown>): PublicEnv {
  return parsePublicEnv({
    mapyApiKey: raw.VITE_MAPY_API_KEY,
    siteUrl: raw.VITE_SITE_URL,
    supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY,
    supabaseUrl: raw.VITE_SUPABASE_URL,
  })
}

export const publicEnv = readVitePublicEnv(import.meta.env)
