import { inaturalistLocale } from '@/entities/nature/lib/inaturalist/locale'
import type { InaturalistTaxonDetail } from '@/entities/nature/lib/inaturalist/types'

export function parseInaturalistTaxonResponse(payload: {
  results?: {
    iconic_taxon_name?: string
    id?: number
    name?: string
    observations_count?: number
    preferred_common_name?: string
    english_common_name?: string
    wikipedia_url?: string
  }[]
}): InaturalistTaxonDetail | null {
  const taxon = payload.results?.[0]
  if (taxon?.id === undefined || taxon.name === undefined) {
    return null
  }

  return {
    commonName:
      taxon.preferred_common_name ?? taxon.english_common_name ?? taxon.name,
    iconicTaxon: taxon.iconic_taxon_name ?? null,
    observationCount: taxon.observations_count ?? 0,
    scientificName: taxon.name,
    taxonId: taxon.id,
    wikipediaUrl: taxon.wikipedia_url ?? null,
  }
}

export async function fetchInaturalistTaxon(
  taxonId: number,
  language = 'en',
): Promise<InaturalistTaxonDetail | null> {
  const params = new URLSearchParams({
    locale: inaturalistLocale(language),
  })

  const response = await fetch(
    `https://api.inaturalist.org/v1/taxa/${String(taxonId)}?${params.toString()}`,
  )
  if (!response.ok) {
    return null
  }

  return parseInaturalistTaxonResponse(
    (await response.json()) as {
      results?: {
        iconic_taxon_name?: string
        id?: number
        name?: string
        observations_count?: number
        preferred_common_name?: string
        english_common_name?: string
        wikipedia_url?: string
      }[]
    },
  )
}
