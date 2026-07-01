import {
  identifyResponseSchema,
  type PhotoIdentifySuggestion,
} from '@/entities/nature/lib/gbif-regional-species'

interface InaturalistScoreImageResponse {
  results?: {
    combined_score?: number
    taxon?: {
      english_common_name?: string
      iconic_taxon_name?: string
      id?: number
      name?: string
      preferred_common_name?: string
    }
  }[]
}

export function parseInaturalistIdentifyResponse(
  payload: InaturalistScoreImageResponse,
  limit = 5,
): PhotoIdentifySuggestion[] {
  const suggestions: PhotoIdentifySuggestion[] = []

  for (const result of payload.results ?? []) {
    const taxon = result.taxon
    if (
      taxon?.id === undefined ||
      taxon.name === undefined ||
      result.combined_score === undefined
    ) {
      continue
    }

    suggestions.push({
      commonName:
        taxon.preferred_common_name ?? taxon.english_common_name ?? taxon.name,
      iconicTaxon: taxon.iconic_taxon_name ?? null,
      score: result.combined_score,
      scientificName: taxon.name,
      taxonId: taxon.id,
    })
  }

  return suggestions
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export function parseIdentifyEdgeResponse(
  payload: unknown,
): PhotoIdentifySuggestion[] {
  return identifyResponseSchema.parse(payload).suggestions
}
