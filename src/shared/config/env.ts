import { parsePublicEnv, type PublicEnv } from '@trip-diary/config'

export function readVitePublicEnv(raw: Record<string, unknown>): PublicEnv {
  return parsePublicEnv({
    mapyApiKey: raw.VITE_MAPY_API_KEY,
    // Build-time flag, default off: client-side photo analysis (phash/quality)
    // is only persisted when the target DB has media.phash/quality columns.
    mediaAnalysis: raw.VITE_MEDIA_ANALYSIS,
    mediaBaseUrl: raw.VITE_MEDIA_BASE_URL,
    siteUrl: raw.VITE_SITE_URL,
    supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY,
    supabaseUrl: raw.VITE_SUPABASE_URL,
    turnstileSiteKey: raw.VITE_TURNSTILE_SITE_KEY,
  })
}

export const publicEnv = readVitePublicEnv(import.meta.env)
