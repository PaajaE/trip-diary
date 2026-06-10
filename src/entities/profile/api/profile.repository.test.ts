import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentProfile,
  updateOwnProfile,
  uploadOwnAvatar,
} from '@/entities/profile/api/profile.repository'

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
}))

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: getSupabaseClientMock,
}))

const userId = crypto.randomUUID()
const profileRow = {
  avatar_url: null,
  bio: 'Traveling slowly.',
  display_name: 'Ečerovi',
  id: userId,
  preferred_locale: 'cs',
  username: 'ecerovi_2016',
}

function createProfileQuery(result: { data: unknown; error: Error | null }) {
  const query = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
    update: vi.fn(),
  }

  query.eq.mockReturnValue(query)
  query.maybeSingle.mockResolvedValue(result)
  query.select.mockReturnValue(query)
  query.single.mockResolvedValue(result)
  query.update.mockReturnValue(query)
  return query
}

describe('profile repository', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
  })

  it('loads and validates the current profile', async () => {
    const profiles = createProfileQuery({ data: profileRow, error: null })
    getSupabaseClientMock.mockReturnValue({ from: vi.fn(() => profiles) })

    await expect(getCurrentProfile({ userId })).resolves.toEqual({
      avatarUrl: null,
      bio: 'Traveling slowly.',
      displayName: 'Ečerovi',
      id: userId,
      preferredLocale: 'cs',
      username: 'ecerovi_2016',
    })
    expect(profiles.eq).toHaveBeenCalledWith('id', userId)
  })

  it('updates only the requested owner profile', async () => {
    const profiles = createProfileQuery({ data: profileRow, error: null })
    getSupabaseClientMock.mockReturnValue({ from: vi.fn(() => profiles) })

    await expect(
      updateOwnProfile({
        bio: 'Traveling slowly.',
        displayName: 'Ečerovi',
        preferredLocale: 'cs',
        userId,
        username: 'ecerovi_2016',
      }),
    ).resolves.toMatchObject({ id: userId, username: 'ecerovi_2016' })
    expect(profiles.update).toHaveBeenCalledWith({
      bio: 'Traveling slowly.',
      display_name: 'Ečerovi',
      preferred_locale: 'cs',
      username: 'ecerovi_2016',
    })
    expect(profiles.eq).toHaveBeenCalledWith('id', userId)
  })

  it('uploads a deterministic public WebP avatar and saves its URL', async () => {
    const avatar = new Blob(['avatar'], { type: 'image/webp' })
    const avatarUrl =
      'https://example.supabase.co/storage/v1/object/public/avatars/avatar.webp'
    const profileUpdate = createProfileQuery({ data: null, error: null })
    const upload = vi.fn().mockResolvedValue({ error: null })
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: avatarUrl },
    })
    const fromStorage = vi.fn(() => ({ getPublicUrl, upload }))
    getSupabaseClientMock.mockReturnValue({
      from: vi.fn(() => profileUpdate),
      storage: { from: fromStorage },
    })

    await expect(uploadOwnAvatar({ avatar, userId })).resolves.toBe(avatarUrl)

    const expectedPath = `${userId}/avatar.webp`
    expect(fromStorage).toHaveBeenCalledWith('avatars')
    expect(upload).toHaveBeenCalledWith(expectedPath, avatar, {
      cacheControl: '0',
      contentType: 'image/webp',
      upsert: true,
    })
    expect(getPublicUrl).toHaveBeenCalledWith(expectedPath)
    expect(profileUpdate.update).toHaveBeenCalledWith({
      avatar_url: avatarUrl,
    })
    expect(profileUpdate.eq).toHaveBeenCalledWith('id', userId)
  })

  it('does not update the profile when avatar upload fails', async () => {
    const uploadError = new Error('upload failed')
    const fromProfiles = vi.fn()
    getSupabaseClientMock.mockReturnValue({
      from: fromProfiles,
      storage: {
        from: vi.fn(() => ({
          getPublicUrl: vi.fn(),
          upload: vi.fn().mockResolvedValue({ error: uploadError }),
        })),
      },
    })

    await expect(
      uploadOwnAvatar({
        avatar: new Blob(['avatar'], { type: 'image/webp' }),
        userId,
      }),
    ).rejects.toBe(uploadError)
    expect(fromProfiles).not.toHaveBeenCalled()
  })
})
