import { z } from 'zod'

const suggestSchema = z.array(
  z.object({
    canonicalName: z.string().optional(),
    key: z.number().int().positive(),
    rank: z.string().optional(),
    scientificName: z.string(),
    vernacularName: z.string().optional(),
  }),
)

export interface SpeciesSuggestion {
  /** Scientific name without the author. */
  scientificName: string
  taxonKey: number
  /** Common name when GBIF knows one in the requested language. */
  vernacularName: string | null
}

const GBIF_BACKBONE = 'd7dddbf4-2cf0-4f39-9b2a-bb099caae36c'
export const MIN_QUERY_LENGTH = 3

/**
 * GBIF species name suggestions (backbone taxonomy, rank species). Returns
 * [] for queries shorter than 3 characters. The response is validated at the
 * boundary; anything unexpected throws and the caller shows a retry.
 */
export async function suggestSpecies(
  query: string,
  language: string,
  signal?: AbortSignal,
): Promise<SpeciesSuggestion[]> {
  const q = query.trim()
  if (Array.from(q).length < MIN_QUERY_LENGTH) return []
  const url = new URL('https://api.gbif.org/v1/species/suggest')
  url.searchParams.set('q', q)
  url.searchParams.set('rank', 'SPECIES')
  url.searchParams.set('datasetKey', GBIF_BACKBONE)
  url.searchParams.set('limit', '8')
  url.searchParams.set('language', language)
  const response = await fetch(url, signal === undefined ? {} : { signal })
  if (!response.ok) {
    throw new Error(`GBIF suggest ${String(response.status)}`)
  }
  const parsed = suggestSchema.parse(await response.json())
  const seen = new Set<number>()
  const result: SpeciesSuggestion[] = []
  for (const item of parsed) {
    if (seen.has(item.key)) continue
    seen.add(item.key)
    result.push({
      scientificName: item.canonicalName ?? item.scientificName,
      taxonKey: item.key,
      vernacularName: item.vernacularName ?? null,
    })
  }
  return result
}

/** Label stored on the species tag: the common name, else the Latin one. */
export function speciesLabel(suggestion: SpeciesSuggestion): string {
  const name = suggestion.vernacularName ?? suggestion.scientificName
  return Array.from(name).slice(0, 120).join('')
}
