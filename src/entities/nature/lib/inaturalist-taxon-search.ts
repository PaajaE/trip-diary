export interface InaturalistTaxonSuggestion {
  commonName: string
  id: number
  rank: string
  scientificName: string
}

function inaturalistLocale(language: string): string {
  return language.startsWith('cs') ? 'cs' : 'en'
}

export function parseInaturalistAutocompleteResponse(payload: {
  results?: {
    id?: number
    name?: string
    preferred_common_name?: string
    english_common_name?: string
    rank?: string
  }[]
}): InaturalistTaxonSuggestion[] {
  return (payload.results ?? [])
    .filter(
      (
        taxon,
      ): taxon is {
        id: number
        name: string
        preferred_common_name?: string
        english_common_name?: string
        rank: string
      } =>
        taxon.id !== undefined &&
        taxon.name !== undefined &&
        taxon.rank !== undefined,
    )
    .map((taxon) => ({
      commonName:
        taxon.preferred_common_name ?? taxon.english_common_name ?? taxon.name,
      id: taxon.id,
      rank: taxon.rank,
      scientificName: taxon.name,
    }))
}

export async function searchInaturalistTaxa(
  query: string,
  language = 'en',
): Promise<InaturalistTaxonSuggestion[]> {
  const term = query.trim()
  if (term.length < 2) {
    return []
  }

  const params = new URLSearchParams({
    locale: inaturalistLocale(language),
    per_page: '8',
    q: term,
  })

  const response = await fetch(
    `https://api.inaturalist.org/v1/taxa/autocomplete?${params.toString()}`,
  )
  if (!response.ok) {
    return []
  }

  return parseInaturalistAutocompleteResponse(
    (await response.json()) as {
      results?: {
        id?: number
        name?: string
        preferred_common_name?: string
        english_common_name?: string
        rank?: string
      }[]
    },
  )
}
