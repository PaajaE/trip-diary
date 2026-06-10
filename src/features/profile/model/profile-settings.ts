import { z } from 'zod'

export const preferredLocaleSchema = z.enum(['cs', 'en'])

export const profileSettingsSchema = z.object({
  bio: z.string().trim().max(500, 'Bio může mít nejvýše 500 znaků.'),
  displayName: z
    .string()
    .trim()
    .max(80, 'Zobrazované jméno může mít nejvýše 80 znaků.'),
  preferredLocale: preferredLocaleSchema,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Uživatelské jméno musí mít alespoň 3 znaky.')
    .max(30, 'Uživatelské jméno může mít nejvýše 30 znaků.')
    .regex(
      /^[a-z0-9_]+$/,
      'Použijte pouze malá písmena bez diakritiky, čísla a podtržítka.',
    ),
})

export type PreferredLocale = z.infer<typeof preferredLocaleSchema>
export type ProfileSettingsValues = z.infer<typeof profileSettingsSchema>

export interface ProfileSettingsSubmission extends ProfileSettingsValues {
  avatarFile: File | null
  userId: string
}
