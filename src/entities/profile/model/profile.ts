import { z } from 'zod'

export const profileSchema = z.object({
  avatarUrl: z.url().nullable(),
  bio: z.string().nullable(),
  displayName: z.string().nullable(),
  id: z.uuid(),
  username: z.string(),
})

export type Profile = z.infer<typeof profileSchema>
