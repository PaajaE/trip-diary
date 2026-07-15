import { describe, expect, it } from 'vitest'
import {
  ConfigurationError,
  validateExpoPublicEnv,
} from './validate-expo-public-env'

describe('validateExpoPublicEnv', () => {
  it('returns mapped env when required vars are present', () => {
    expect(
      validateExpoPublicEnv({
        EXPO_PUBLIC_MAPY_API_KEY: 'map-key',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).toEqual({
      mapyApiKey: 'map-key',
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'https://project.supabase.co',
    })
  })

  it('throws ConfigurationError listing missing required vars', () => {
    expect(() => validateExpoPublicEnv({})).toThrow(ConfigurationError)
    expect(() => validateExpoPublicEnv({})).toThrow(
      'Missing required environment variables',
    )

    try {
      validateExpoPublicEnv({})
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError)
      expect((error as ConfigurationError).missingVars).toEqual([
        'EXPO_PUBLIC_SUPABASE_URL',
        'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      ])
    }
  })

  it('treats blank values as missing', () => {
    expect(() =>
      validateExpoPublicEnv({
        EXPO_PUBLIC_SUPABASE_ANON_KEY: '   ',
        EXPO_PUBLIC_SUPABASE_URL: '',
      }),
    ).toThrow(ConfigurationError)
  })
})
