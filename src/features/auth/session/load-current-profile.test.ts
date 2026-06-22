import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import { loadCurrentProfile } from '@/features/auth/session/load-current-profile'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => true),
}))

const userId = 'e7a8d51b-e975-46aa-965c-1d52c54fa119'

function mockProfileResult(result: {
  data: Record<string, unknown> | null
  error: Error | null
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))

  vi.mocked(getSupabaseClient).mockReturnValue({
    from,
  } as unknown as ReturnType<typeof getSupabaseClient>)

  return { eq, from, select }
}

describe('loadCurrentProfile', () => {
  afterEach(async () => {
    sessionStorage.clear()
    await localDb.cachedProfiles.clear()
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(true)
  })

  it('loads and validates the profile belonging to the user', async () => {
    const query = mockProfileResult({
      data: {
        avatar_url: null,
        bio: 'Na cestě',
        display_name: 'Ečerovi',
        id: userId,
        preferred_locale: 'cs',
        username: 'ecerovi2016',
      },
      error: null,
    })

    await expect(loadCurrentProfile(userId)).resolves.toEqual({
      avatarUrl: null,
      bio: 'Na cestě',
      displayName: 'Ečerovi',
      id: userId,
      preferredLocale: 'cs',
      username: 'ecerovi2016',
    })
    expect(query.from).toHaveBeenCalledWith('profiles')
    expect(query.eq).toHaveBeenCalledWith('id', userId)
  })

  it('returns null when the profile does not exist yet', async () => {
    mockProfileResult({ data: null, error: null })

    await expect(loadCurrentProfile(userId)).resolves.toBeNull()
  })

  it('rejects malformed profile data at the boundary', async () => {
    mockProfileResult({
      data: {
        avatar_url: null,
        bio: null,
        display_name: null,
        id: 'not-a-uuid',
        username: 'invalid',
      },
      error: null,
    })

    await expect(loadCurrentProfile(userId)).rejects.toThrow()
  })

  it('returns the cached profile when offline', async () => {
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
    await localDb.cachedProfiles.put({
      cachedAt: new Date().toISOString(),
      profile: {
        avatarUrl: null,
        bio: 'Na cestě',
        displayName: 'Ečerovi',
        id: userId,
        preferredLocale: 'cs',
        username: 'ecerovi2016',
      },
      userId,
    })

    await expect(loadCurrentProfile(userId)).resolves.toEqual({
      avatarUrl: null,
      bio: 'Na cestě',
      displayName: 'Ečerovi',
      id: userId,
      preferredLocale: 'cs',
      username: 'ecerovi2016',
    })
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('migrates sessionStorage profile cache into IndexedDB', async () => {
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
    sessionStorage.setItem(
      `trip-diary:profile:${userId}`,
      JSON.stringify({
        avatarUrl: null,
        bio: 'Na cestě',
        displayName: 'Ečerovi',
        id: userId,
        preferredLocale: 'cs',
        username: 'ecerovi2016',
      }),
    )

    await expect(loadCurrentProfile(userId)).resolves.toEqual({
      avatarUrl: null,
      bio: 'Na cestě',
      displayName: 'Ečerovi',
      id: userId,
      preferredLocale: 'cs',
      username: 'ecerovi2016',
    })

    const cached = await localDb.cachedProfiles.get(userId)
    expect(cached?.profile.username).toBe('ecerovi2016')
  })
})
