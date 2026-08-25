import { z } from 'zod'

export const publicEnvSchema = z.object({
  mapyApiKey: z.string().min(1).optional(),
  siteUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(1).optional(),
  supabaseUrl: z.url().optional(),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

function blankToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined
  }
  return value
}

export function parsePublicEnv(raw: Record<string, unknown>): PublicEnv {
  return publicEnvSchema.parse({
    mapyApiKey: blankToUndefined(raw.mapyApiKey),
    siteUrl: blankToUndefined(raw.siteUrl),
    supabaseAnonKey: blankToUndefined(raw.supabaseAnonKey),
    supabaseUrl: blankToUndefined(raw.supabaseUrl),
  })
}
