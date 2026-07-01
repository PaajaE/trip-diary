import { z } from 'zod'
import type { JourneyBbox } from '@/entities/nature/lib/journey-bbox'
import { identifyResponseSchema } from '@/entities/nature/lib/gbif-regional-species'
import type { PhotoIdentifySuggestion } from '@/entities/nature/lib/gbif-regional-species'
import type { RegionalSpecies } from '@/entities/nature/model/observation'
import { publicEnv } from '@/shared/config/env'
import { getSupabaseClient } from '@/shared/api/supabase'
import { isBrowserOnline } from '@/shared/lib/network'

const gbifResponseSchema = z.object({
  species: z.array(
    z.object({
      commonName: z.string(),
      occurrenceCount: z.number(),
      scientificName: z.string(),
      source: z.literal('gbif'),
      taxonKey: z.number(),
    }),
  ),
})

const edgeErrorSchema = z.object({
  error: z.string(),
})

function isSupabaseConfigured(): boolean {
  return (
    publicEnv.VITE_SUPABASE_URL !== undefined &&
    publicEnv.VITE_SUPABASE_ANON_KEY !== undefined
  )
}

export async function fetchRegionalSpeciesViaEdge(input: {
  bbox?: JourneyBbox | null
  latitude: number
  limit?: number
  longitude: number
}): Promise<RegionalSpecies[] | null> {
  if (!isBrowserOnline() || !isSupabaseConfigured()) {
    return null
  }

  try {
    const result = await getSupabaseClient().functions.invoke('nature-gbif', {
      body: {
        ...(input.bbox !== undefined && input.bbox !== null
          ? { bbox: input.bbox }
          : {}),
        latitude: input.latitude,
        limit: input.limit ?? 12,
        longitude: input.longitude,
      },
    })
    if (result.error !== null) {
      return null
    }

    return gbifResponseSchema.parse(result.data).species
  } catch {
    return null
  }
}

export async function identifyPhotoViaEdge(input: {
  imageBase64: string
  latitude?: number | null
  longitude?: number | null
  mimeType?: string
}): Promise<PhotoIdentifySuggestion[] | null> {
  if (!isBrowserOnline() || !isSupabaseConfigured()) {
    return null
  }

  try {
    const result = await getSupabaseClient().functions.invoke(
      'nature-identify',
      {
        body: {
          imageBase64: input.imageBase64,
          ...(input.latitude != null ? { latitude: input.latitude } : {}),
          ...(input.longitude != null ? { longitude: input.longitude } : {}),
          ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
        },
      },
    )
    if (result.error !== null) {
      return null
    }

    const edgeError = edgeErrorSchema.safeParse(result.data)
    if (edgeError.success && edgeError.data.error === 'not_configured') {
      return null
    }

    return identifyResponseSchema.parse(result.data).suggestions
  } catch {
    return null
  }
}
