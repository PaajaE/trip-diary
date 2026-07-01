import {
  regionalSpeciesSchema,
  type RegionalSpecies,
} from '@/entities/nature/model/observation'

interface GbifOccurrenceResult {
  results?: {
    species?: string
    speciesKey?: number
    vernacularName?: string
  }[]
}

const regionalSpeciesCache = new Map<string, RegionalSpecies[]>()

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)}:${longitude.toFixed(2)}`
}

export async function fetchRegionalSpecies(input: {
  latitude: number
  longitude: number
  limit?: number
}): Promise<RegionalSpecies[]> {
  const key = cacheKey(input.latitude, input.longitude)
  const cached = regionalSpeciesCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const limit = input.limit ?? 12
  const url = new URL('https://api.gbif.org/v1/occurrence/search')
  url.searchParams.set('decimalLatitude', String(input.latitude))
  url.searchParams.set('decimalLongitude', String(input.longitude))
  url.searchParams.set('limit', String(limit * 3))
  url.searchParams.set('hasCoordinate', 'true')
  url.searchParams.set('hasGeospatialIssue', 'false')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('GBIF request failed')
  }

  const payload = (await response.json()) as GbifOccurrenceResult
  const aggregated = new Map<number, RegionalSpecies>()

  for (const result of payload.results ?? []) {
    if (result.speciesKey === undefined || result.species === undefined) {
      continue
    }

    const existing = aggregated.get(result.speciesKey)
    if (existing === undefined) {
      aggregated.set(
        result.speciesKey,
        regionalSpeciesSchema.parse({
          commonName: result.vernacularName ?? result.species,
          occurrenceCount: 1,
          scientificName: result.species,
          source: 'gbif',
          taxonKey: result.speciesKey,
        }),
      )
      continue
    }

    aggregated.set(result.speciesKey, {
      ...existing,
      occurrenceCount: existing.occurrenceCount + 1,
    })
  }

  const species = [...aggregated.values()]
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
    .slice(0, limit)

  regionalSpeciesCache.set(key, species)
  return species
}

export async function fetchWikipediaSummary(
  title: string,
): Promise<string | null> {
  const encoded = encodeURIComponent(title.replaceAll(' ', '_'))
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
  )
  if (!response.ok) {
    return null
  }

  const payload = (await response.json()) as { extract?: string }
  return payload.extract ?? null
}
