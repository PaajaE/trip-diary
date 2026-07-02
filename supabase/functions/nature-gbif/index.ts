import { handleOptions, jsonResponse } from '../_shared/http.ts'

interface GbifOccurrenceResult {
  results?: {
    species?: string
    speciesKey?: number
    vernacularName?: string
  }[]
}

interface RegionalSpecies {
  commonName: string
  occurrenceCount: number
  scientificName: string
  source: 'gbif'
  taxonKey: number
}

interface GbifRequestBody {
  bbox?: {
    maxLatitude: number
    maxLongitude: number
    minLatitude: number
    minLongitude: number
  }
  latitude: number
  limit?: number
  longitude: number
}

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
      aggregated.set(result.speciesKey, {
        commonName: result.vernacularName ?? result.species,
        occurrenceCount: 1,
        scientificName: result.species,
        source: 'gbif',
        taxonKey: result.speciesKey,
      })
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

function bboxCenter(bbox: NonNullable<GbifRequestBody['bbox']>): {
  latitude: number
  longitude: number
} {
  return {
    latitude: (bbox.minLatitude + bbox.maxLatitude) / 2,
    longitude: (bbox.minLongitude + bbox.maxLongitude) / 2,
  }
}

async function fetchGbifSpecies(
  body: GbifRequestBody,
): Promise<RegionalSpecies[]> {
  const limit = body.limit ?? 12
  const url = new URL('https://api.gbif.org/v1/occurrence/search')
  url.searchParams.set('hasCoordinate', 'true')
  url.searchParams.set('hasGeospatialIssue', 'false')
  url.searchParams.set('limit', String(limit * 3))

  if (body.bbox !== undefined) {
    const center = bboxCenter(body.bbox)
    url.searchParams.set('decimalLatitude', String(center.latitude))
    url.searchParams.set('decimalLongitude', String(center.longitude))
    url.searchParams.set(
      'geometry',
      `POLYGON((${String(body.bbox.minLongitude)} ${String(body.bbox.minLatitude)}, ${String(body.bbox.maxLongitude)} ${String(body.bbox.minLatitude)}, ${String(body.bbox.maxLongitude)} ${String(body.bbox.maxLatitude)}, ${String(body.bbox.minLongitude)} ${String(body.bbox.maxLatitude)}, ${String(body.bbox.minLongitude)} ${String(body.bbox.minLatitude)}))`,
    )
  } else {
    url.searchParams.set('decimalLatitude', String(body.latitude))
    url.searchParams.set('decimalLongitude', String(body.longitude))
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('GBIF request failed')
  }

  const payload = (await response.json()) as GbifOccurrenceResult
  return aggregateGbifResults(payload.results, limit)
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options !== null) {
    return options
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const body = (await request.json()) as GbifRequestBody
    if (!Number.isFinite(body.latitude) || !Number.isFinite(body.longitude)) {
      return jsonResponse({ error: 'invalid_coordinates' }, 400)
    }

    const limit = Math.min(Math.max(body.limit ?? 12, 1), 30)
    const species = await fetchGbifSpecies({ ...body, limit })
    return jsonResponse({ species }, 200, {
      'Cache-Control': 'public, max-age=300',
    })
  } catch (error) {
    console.error('[nature-gbif]', error)
    return jsonResponse({ error: 'gbif_failed' }, 502)
  }
})
