import {
  bboxCacheKey,
  bboxCenter,
  type JourneyBbox,
} from '@/entities/nature/lib/journey-bbox'
import {
  regionalSpeciesSchema,
  type RegionalSpecies,
} from '@/entities/nature/model/observation'
import { localDb } from '@/shared/lib/local-db'

interface GbifOccurrenceResult {
  results?: {
    species?: string
    speciesKey?: number
    vernacularName?: string
  }[]
}

const regionalSpeciesMemoryCache = new Map<string, RegionalSpecies[]>()
const lastFetchByJourney = new Map<string, number>()
const RATE_LIMIT_MS = 60_000

function aggregateGbifResults(
  results: GbifOccurrenceResult['results'],
  limit: number,
): RegionalSpecies[] {
  const aggregated = new Map<number, RegionalSpecies>()

  for (const result of results ?? []) {
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

  return [...aggregated.values()]
    .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
    .slice(0, limit)
}

async function readGuideCache(
  journeyId: string,
  cacheKey: string,
): Promise<RegionalSpecies[] | null> {
  const record = await localDb.natureGuideCache.get(`${journeyId}:${cacheKey}`)
  if (record === undefined) {
    return null
  }
  return record.species
}

async function writeGuideCache(
  journeyId: string,
  cacheKey: string,
  species: RegionalSpecies[],
): Promise<void> {
  await localDb.natureGuideCache.put({
    cacheKey,
    fetchedAt: new Date().toISOString(),
    id: `${journeyId}:${cacheKey}`,
    journeyId,
    species,
  })
}

export async function fetchRegionalSpecies(input: {
  bbox?: JourneyBbox | null
  journeyId?: string
  latitude: number
  limit?: number
  longitude: number
}): Promise<RegionalSpecies[]> {
  const limit = input.limit ?? 12
  const bbox = input.bbox ?? null
  const cacheKey =
    bbox === null
      ? `${input.latitude.toFixed(2)}:${input.longitude.toFixed(2)}`
      : bboxCacheKey(bbox)

  if (input.journeyId !== undefined) {
    const lastFetch = lastFetchByJourney.get(input.journeyId) ?? 0
    if (Date.now() - lastFetch < RATE_LIMIT_MS) {
      const cached = await readGuideCache(input.journeyId, cacheKey)
      if (cached !== null) {
        return cached
      }
    }
  }

  const memoryCached = regionalSpeciesMemoryCache.get(cacheKey)
  if (memoryCached !== undefined) {
    return memoryCached
  }

  if (input.journeyId !== undefined) {
    const cached = await readGuideCache(input.journeyId, cacheKey)
    if (cached !== null) {
      regionalSpeciesMemoryCache.set(cacheKey, cached)
      return cached
    }
  }

  const url = new URL('https://api.gbif.org/v1/occurrence/search')
  url.searchParams.set('hasCoordinate', 'true')
  url.searchParams.set('hasGeospatialIssue', 'false')
  url.searchParams.set('limit', String(limit * 3))

  if (bbox !== null) {
    url.searchParams.set('decimalLatitude', String(bboxCenter(bbox).latitude))
    url.searchParams.set('decimalLongitude', String(bboxCenter(bbox).longitude))
    url.searchParams.set(
      'geometry',
      `POLYGON((${String(bbox.minLongitude)} ${String(bbox.minLatitude)}, ${String(bbox.maxLongitude)} ${String(bbox.minLatitude)}, ${String(bbox.maxLongitude)} ${String(bbox.maxLatitude)}, ${String(bbox.minLongitude)} ${String(bbox.maxLatitude)}, ${String(bbox.minLongitude)} ${String(bbox.minLatitude)}))`,
    )
  } else {
    url.searchParams.set('decimalLatitude', String(input.latitude))
    url.searchParams.set('decimalLongitude', String(input.longitude))
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('GBIF request failed')
  }

  const payload = (await response.json()) as GbifOccurrenceResult
  const species = aggregateGbifResults(payload.results, limit)

  regionalSpeciesMemoryCache.set(cacheKey, species)
  if (input.journeyId !== undefined) {
    lastFetchByJourney.set(input.journeyId, Date.now())
    await writeGuideCache(input.journeyId, cacheKey, species)
  }

  return species
}

function wikipediaLanguage(language: string): string {
  return language.startsWith('cs') ? 'cs' : 'en'
}

export async function fetchWikipediaSummary(
  title: string,
  language = 'en',
): Promise<string | null> {
  const encoded = encodeURIComponent(title.replaceAll(' ', '_'))
  const wikiLang = wikipediaLanguage(language)
  const response = await fetch(
    `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
  )
  if (!response.ok) {
    if (wikiLang !== 'en') {
      return fetchWikipediaSummary(title, 'en')
    }
    return null
  }

  const payload = (await response.json()) as { extract?: string }
  return payload.extract ?? null
}
