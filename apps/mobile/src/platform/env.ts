import { parsePublicEnv, type PublicEnv } from '@trip-diary/config'

export type MobilePublicEnv = PublicEnv

/**
 * Direct `process.env.EXPO_PUBLIC_*` reads so babel-preset-expo can inline
 * values into Release/standalone bundles. Dynamic `process.env[name]` /
 * `raw.EXPO_PUBLIC_*` access is left as-is at runtime and breaks offline builds.
 */
export function expoPublicEnvFromProcess(): Record<string, string | undefined> {
  return {
    EXPO_PUBLIC_MAPY_API_KEY: process.env.EXPO_PUBLIC_MAPY_API_KEY,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  }
}

export function readExpoPublicEnv(
  raw: Record<string, unknown> = expoPublicEnvFromProcess(),
): MobilePublicEnv {
  return parsePublicEnv({
    mapyApiKey: raw.EXPO_PUBLIC_MAPY_API_KEY,
    supabaseAnonKey: raw.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: raw.EXPO_PUBLIC_SUPABASE_URL,
  })
}

export const mobilePublicEnv = readExpoPublicEnv()
