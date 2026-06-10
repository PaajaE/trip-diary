import { describe, expect, it } from 'vitest'
import {
  updateOwnProfileSchema,
  uploadOwnAvatarSchema,
} from '@/entities/profile/model/profile'

describe('profile models', () => {
  it('normalizes editable profile text', () => {
    expect(
      updateOwnProfileSchema.parse({
        bio: '  Traveling slowly.  ',
        displayName: '  Ečerovi  ',
        preferredLocale: 'cs',
        userId: crypto.randomUUID(),
        username: '  ecerovi_2016  ',
      }),
    ).toMatchObject({
      bio: 'Traveling slowly.',
      displayName: 'Ečerovi',
      preferredLocale: 'cs',
      username: 'ecerovi_2016',
    })
  })

  it('rejects unsupported usernames and locales', () => {
    const result = updateOwnProfileSchema.safeParse({
      bio: null,
      displayName: null,
      preferredLocale: 'de',
      userId: crypto.randomUUID(),
      username: 'Ečerovi',
    })

    expect(result.success).toBe(false)
  })

  it('accepts only compact WebP avatars', () => {
    const userId = crypto.randomUUID()

    expect(
      uploadOwnAvatarSchema.safeParse({
        avatar: new Blob(['avatar'], { type: 'image/webp' }),
        userId,
      }).success,
    ).toBe(true)
    expect(
      uploadOwnAvatarSchema.safeParse({
        avatar: new Blob(['avatar'], { type: 'image/jpeg' }),
        userId,
      }).success,
    ).toBe(false)
  })
})
