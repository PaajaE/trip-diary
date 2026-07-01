import type { InaturalistTaxonMatch } from '@/entities/nature/lib/inaturalist/types'

interface SpeciesCountsResponse {
  results?: {
    count?: number
    taxon?: {
      iconic_taxon_name?: string
      id?: number
      name?: string
      preferred_common_name?: string
      english_common_name?: string
    }
  }[]
}

export function parseInaturalistSpeciesCountsResponse(
  payload: SpeciesCountsResponse,
  limit = 8,
): InaturalistTaxonMatch[] {
  const matches: InaturalistTaxonMatch[] = []

  for (const result of payload.results ?? []) {
    const taxon = result.taxon
    if (
      taxon?.id === undefined ||
      taxon.name === undefined ||
      result.count === undefined
    ) {
      continue
    }

    matches.push({
      commonName:
        taxon.preferred_common_name ?? taxon.english_common_name ?? taxon.name,
      iconicTaxon: taxon.iconic_taxon_name ?? null,
      localObservationCount: result.count,
      scientificName: taxon.name,
      taxonId: taxon.id,
    })
  }

  return matches
    .sort(
      (left, right) => right.localObservationCount - left.localObservationCount,
    )
    .slice(0, limit)
}

export async function fetchNearbyInaturalistSpecies(input: {
  latitude: number
  limit?: number
  longitude: number
  radiusKm?: number
}): Promise<InaturalistTaxonMatch[]> {
  const params = new URLSearchParams({
    lat: String(input.latitude),
    lng: String(input.longitude),
    per_page: String(input.limit ?? 8),
    radius: String(input.radiusKm ?? 30),
  })

  const response = await fetch(
    `https://api.inaturalist.org/v1/observations/species_counts?${params.toString()}`,
  )
  if (!response.ok) {
    return []
  }

  return parseInaturalistSpeciesCountsResponse(
    (await response.json()) as SpeciesCountsResponse,
    input.limit ?? 8,
  )
}
