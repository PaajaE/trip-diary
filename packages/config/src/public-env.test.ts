import { describe, expect, it } from 'vitest'
import { parsePublicEnv } from './public-env.ts'

describe('parsePublicEnv', () => {
  it('parses optional public env fields', () => {
    expect(
      parsePublicEnv({
        mapyApiKey: 'map-key',
        siteUrl: 'https://example.com',
        supabaseAnonKey: 'anon-key',
        supabaseUrl: 'https://project.supabase.co',
      }),
    ).toEqual({
      mapyApiKey: 'map-key',
      siteUrl: 'https://example.com',
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'https://project.supabase.co',
    })
  })

  it('accepts an empty env object', () => {
    expect(parsePublicEnv({})).toEqual({})
  })

  it('treats blank optional strings as unset', () => {
    expect(
      parsePublicEnv({
        mapyApiKey: '',
        siteUrl: '   ',
        supabaseAnonKey: '',
        supabaseUrl: '',
      }),
    ).toEqual({})
  })

  it('parses the mediaAnalysis flag from true/false strings, unset by default', () => {
    expect(parsePublicEnv({ mediaAnalysis: 'true' })).toEqual({
      mediaAnalysis: true,
    })
    expect(parsePublicEnv({ mediaAnalysis: 'false' })).toEqual({
      mediaAnalysis: false,
    })
    expect(parsePublicEnv({ mediaAnalysis: '' })).toEqual({})
    expect(() => parsePublicEnv({ mediaAnalysis: 'yes' })).toThrow()
  })
})
