import { z } from 'zod'

export const publicEnvSchema = z.object({
  mapyApiKey: z.string().min(1).optional(),
  mediaAnalysis: z.boolean().optional(),
  mediaBaseUrl: z.url().optional(),
  mediaCorrections: z.boolean().optional(),
  siteUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(1).optional(),
  supabaseUrl: z.url().optional(),
  turnstileSiteKey: z.string().min(1).optional(),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

function blankToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined
  }
  return value
}

/** Accepts only 'true' / 'false' (or a boolean); anything else fails validation. */
function booleanFlag(value: unknown): unknown {
  const raw = blankToUndefined(value)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
}

export function parsePublicEnv(raw: Record<string, unknown>): PublicEnv {
  return publicEnvSchema.parse({
    mapyApiKey: blankToUndefined(raw.mapyApiKey),
    mediaAnalysis: booleanFlag(raw.mediaAnalysis),
    mediaBaseUrl: blankToUndefined(raw.mediaBaseUrl),
    mediaCorrections: booleanFlag(raw.mediaCorrections),
    siteUrl: blankToUndefined(raw.siteUrl),
    supabaseAnonKey: blankToUndefined(raw.supabaseAnonKey),
    supabaseUrl: blankToUndefined(raw.supabaseUrl),
    turnstileSiteKey: blankToUndefined(raw.turnstileSiteKey),
  })
}
