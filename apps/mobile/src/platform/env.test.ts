import { describe, expect, it } from 'vitest'
import { readExpoPublicEnv } from './env'

describe('readExpoPublicEnv', () => {
  it('maps EXPO_PUBLIC vars through parsePublicEnv', () => {
    expect(
      readExpoPublicEnv({
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

  it('accepts missing env values', () => {
    expect(readExpoPublicEnv({})).toEqual({})
  })
})
