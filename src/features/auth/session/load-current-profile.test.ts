import { describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from '@/shared/api/supabase'
import { loadCurrentProfile } from '@/features/auth/session/load-current-profile'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
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
  it('loads and validates the profile belonging to the user', async () => {
    const query = mockProfileResult({
      data: {
        avatar_url: null,
        bio: 'Na cestě',
        display_name: 'Ečerovi',
        id: userId,
        username: 'ecerovi2016',
      },
      error: null,
    })

    await expect(loadCurrentProfile(userId)).resolves.toEqual({
      avatarUrl: null,
      bio: 'Na cestě',
      displayName: 'Ečerovi',
      id: userId,
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
})
