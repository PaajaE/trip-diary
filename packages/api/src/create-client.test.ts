import { describe, expect, it, vi } from 'vitest'
import { createTripDiaryClient } from './create-client.ts'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(
    (
      url: string,
      key: string,
      options: {
        auth?: {
          autoRefreshToken?: boolean
          detectSessionInUrl?: boolean
          persistSession?: boolean
          storage?: unknown
        }
      },
    ) => ({
      authOptions: options.auth,
      key,
      url,
    }),
  ),
}))

describe('createTripDiaryClient', () => {
  it('creates a client with default web-friendly auth options', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createTripDiaryClient({
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'http://127.0.0.1:54321',
    })

    expect(createClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'anon-key',
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      },
    )
    expect(client).toMatchObject({
      key: 'anon-key',
      url: 'http://127.0.0.1:54321',
    })
  })

  it('forwards mobile storage and disables URL session detection', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const storage = {
      getItem: vi.fn(),
      removeItem: vi.fn(),
      setItem: vi.fn(),
    }

    createTripDiaryClient({
      auth: {
        detectSessionInUrl: false,
        storage,
      },
      supabaseAnonKey: 'anon-key',
      supabaseUrl: 'http://127.0.0.1:54321',
    })

    expect(createClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'anon-key',
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: false,
          persistSession: true,
          storage,
        },
      },
    )
  })
})
