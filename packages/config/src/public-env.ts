import { z } from 'zod'

export const publicEnvSchema = z.object({
  mapyApiKey: z.string().min(1).optional(),
  siteUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(1).optional(),
  supabaseUrl: z.url().optional(),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

export function parsePublicEnv(raw: Record<string, unknown>): PublicEnv {
  return publicEnvSchema.parse(raw)
}
