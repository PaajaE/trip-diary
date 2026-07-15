import { parsePublicEnv, type PublicEnv } from '@trip-diary/config'

export type MobilePublicEnv = PublicEnv

export function readExpoPublicEnv(
  raw: Record<string, unknown> = process.env,
): MobilePublicEnv {
  return parsePublicEnv({
    mapyApiKey: raw.EXPO_PUBLIC_MAPY_API_KEY,
    supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL,
  })
}

export const mobilePublicEnv = readExpoPublicEnv()
