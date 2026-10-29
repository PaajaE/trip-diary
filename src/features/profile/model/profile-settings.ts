import { z } from 'zod'

/** Messages are i18n keys (`profile.settings.errors.*`); the form translates them. */
export const preferredLocaleSchema = z.enum(['cs', 'en'])

export const profileSettingsSchema = z.object({
  bio: z.string().trim().max(500, 'profile.settings.errors.bio'),
  displayName: z.string().trim().max(80, 'profile.settings.errors.displayName'),
  preferredLocale: preferredLocaleSchema,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'profile.settings.errors.usernameMin')
    .max(30, 'profile.settings.errors.usernameMax')
    .regex(/^[a-z0-9_]+$/, 'profile.settings.errors.usernamePattern'),
})

export type PreferredLocale = z.infer<typeof preferredLocaleSchema>
export type ProfileSettingsValues = z.infer<typeof profileSettingsSchema>

export interface ProfileSettingsSubmission extends ProfileSettingsValues {
  avatarFile: File | null
  userId: string
}
