import { z } from 'zod'
import type { JourneyBbox } from '@/entities/nature/lib/journey-bbox'
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

function isSupabaseConfigured(): boolean {
  return (
    publicEnv.supabaseUrl !== undefined &&
    publicEnv.supabaseAnonKey !== undefined
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
