import { z } from 'zod'

const publicEnvSchema = z.object({
  VITE_MAPY_API_KEY: z.string().min(1).optional(),
  VITE_SUPABASE_URL: z.url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
})

export const publicEnv = publicEnvSchema.parse(import.meta.env)
