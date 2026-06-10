import { z } from 'zod'

const nullableDisplayNameSchema = z.string().trim().min(1).max(80).nullable()

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9_]{3,30}$/)

export const preferredLocaleSchema = z.enum(['cs', 'en'])

export const profileSchema = z.object({
  avatarUrl: z.url().nullable(),
  bio: z.string().trim().max(500).nullable(),
  displayName: nullableDisplayNameSchema,
  id: z.uuid(),
  username: usernameSchema,
})

export const currentProfileSchema = profileSchema.extend({
  preferredLocale: preferredLocaleSchema,
})

export const getCurrentProfileSchema = z.object({
  userId: z.uuid(),
})

export const updateOwnProfileSchema = z.object({
  bio: z.string().trim().max(500).nullable(),
  displayName: nullableDisplayNameSchema,
  preferredLocale: preferredLocaleSchema,
  userId: z.uuid(),
  username: usernameSchema,
})

export const uploadOwnAvatarSchema = z.object({
  avatar: z
    .instanceof(Blob)
    .refine((blob) => blob.type === 'image/webp', {
      message: 'Avatar must be a WebP image',
    })
    .refine((blob) => blob.size > 0, {
      message: 'Avatar must not be empty',
    })
    .refine((blob) => blob.size <= 1024 * 1024, {
      message: 'Avatar must not exceed 1 MB',
    }),
  userId: z.uuid(),
})

export type Profile = z.infer<typeof profileSchema>
export type CurrentProfile = z.infer<typeof currentProfileSchema>
export type GetCurrentProfileInput = z.infer<typeof getCurrentProfileSchema>
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>
export type UploadOwnAvatarInput = z.infer<typeof uploadOwnAvatarSchema>
