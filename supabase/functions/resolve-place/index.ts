// Resolves a place name for a position (cached).
//
// Order: Geoapify nearby places (settlement, peak/lake/glacier, worthy
// attraction, prominent feature, "u <settlement>") -> Mapy.com administrative reverse geocoding -> null.
// - API keys                  -> GEOAPIFY_API_KEY (optional), MAPY_API_KEY
//                                (secrets; never logged, request URLs carry them)
// - results cached            -> public.place_lookups + places.source_ref
// - end-user triggered only   -> requires a signed-in user
// Attribution "© Seznam.cz a.s." / Mapy.com is shown wherever names appear.
// (OSM Nominatim answered HTTP 403 to the shared cloud egress, hence Mapy.com.)

import {
  createClient,
  type SupabaseClient,
} from 'npm:@supabase/supabase-js@2.49.1'

import { handleOptions, jsonResponse } from '../_shared/http.ts'
import {
  buildNearbyUrl,
  buildSettlementsUrl,
  featuresOf,
  GEOAPIFY_GEOCODE_SOURCE,
  pickNearbyPlace,
} from '../_shared/places/geoapify.ts'
import {
  buildReverseUrl,
  lookupGridKey,
  placeFromMapyResult,
  PLACE_GEOCODE_SOURCE,
  type PlaceCandidate,
  type ReverseQuery,
} from '../_shared/places/mapy.ts'

interface PlaceRow {
  country_code: string | null
  id: string
  kind: string | null
  latitude: number
  longitude: number
  name: string
  region: string | null
}

const PLACE_COLUMNS =
  'id, name, country_code, region, latitude, longitude, kind'

function env(name: string): string {
  const value = Deno.env.get(name)
  if (value === undefined || value === '') {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function parseQuery(body: unknown): ReverseQuery | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const { latitude, longitude } = body as Record<string, unknown>
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null
  }
  return { latitude, longitude }
}

function toResponsePlace(row: PlaceRow) {
  return {
    countryCode: row.country_code,
    id: row.id,
    kind: row.kind,
    latitude: row.latitude,
    longitude: row.longitude,
    name: row.name,
    region: row.region,
  }
}

async function reverse(query: ReverseQuery, apiKey: string): Promise<unknown> {
  // Network errors can embed the request URL (and so the key): rethrow bare.
  const response = await fetch(buildReverseUrl(query, apiKey)).catch(() => {
    throw new Error('mapy network error')
  })
  if (!response.ok) {
    throw new Error(`mapy ${String(response.status)}`)
  }
  return await response.json()
}

const GEOAPIFY_TIMEOUT_MS = 6000
let warnedNoGeoapifyKey = false

async function geoapifyFetch(url: string): Promise<unknown> {
  // Errors can embed the request URL (and so the key): rethrow bare.
  const response = await fetch(url, {
    signal: AbortSignal.timeout(GEOAPIFY_TIMEOUT_MS),
  }).catch(() => {
    throw new Error('geoapify network error')
  })
  if (!response.ok) {
    throw new Error(`geoapify ${String(response.status)}`)
  }
  return await response.json()
}

/** Settlements first; nature/attractions only when no settlement is near. */
async function geoapifyPlace(
  query: ReverseQuery,
  apiKey: string | undefined,
): Promise<PlaceCandidate | null> {
  if (apiKey === undefined || apiKey === '') {
    if (!warnedNoGeoapifyKey) {
      warnedNoGeoapifyKey = true
      console.warn('resolve-place: GEOAPIFY_API_KEY is not configured')
    }
    return null
  }
  try {
    // Call 1 (40 km) serves the settlement tier and the "u <Settlement>"
    // fallback; call 2 (8 km) only when no settlement is close enough.
    const settlements = featuresOf(
      await geoapifyFetch(buildSettlementsUrl(query, apiKey)),
    )
    const settlement = pickNearbyPlace(settlements, query)
    if (settlement !== null && !settlement.sourceRef.endsWith(':near')) {
      return settlement
    }
    const nearby = featuresOf(
      await geoapifyFetch(buildNearbyUrl(query, apiKey)),
    )
    return pickNearbyPlace([...settlements, ...nearby], query)
  } catch (error) {
    console.warn(
      'resolve-place: geoapify failed, falling back to mapy',
      error instanceof Error ? error.message : 'unknown',
    )
    return null
  }
}

async function storePlace(
  service: SupabaseClient,
  candidate: PlaceCandidate,
  geocodeSource: string,
): Promise<PlaceRow> {
  const existing = await service
    .from('places')
    .select(PLACE_COLUMNS)
    .eq('source_ref', candidate.sourceRef)
    .maybeSingle()
  if (existing.data !== null) {
    return existing.data as PlaceRow
  }
  const inserted = await service
    .from('places')
    .insert({
      country_code: candidate.countryCode,
      geocode_source: geocodeSource,
      kind: candidate.kind,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      name: candidate.name.slice(0, 200),
      region: candidate.region?.slice(0, 200) ?? null,
      source_ref: candidate.sourceRef,
    })
    .select(PLACE_COLUMNS)
    .single()
  if (inserted.error === null) {
    return inserted.data as PlaceRow
  }
  // A concurrent request stored the same place first.
  const retry = await service
    .from('places')
    .select(PLACE_COLUMNS)
    .eq('source_ref', candidate.sourceRef)
    .single()
  if (retry.error !== null) {
    throw new Error(`store place: ${inserted.error.message}`)
  }
  return retry.data as PlaceRow
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options !== null) {
    return options
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const authHeader = request.headers.get('Authorization')
  if (authHeader === null || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  const mapyKey = Deno.env.get('MAPY_API_KEY')
  if (mapyKey === undefined || mapyKey === '') {
    console.error('resolve-place: MAPY_API_KEY is not configured')
    return jsonResponse({ error: 'geocoding_unconfigured' }, 500)
  }

  try {
    const supabaseUrl = env('SUPABASE_URL')
    const user = await createClient(supabaseUrl, env('SUPABASE_ANON_KEY'), {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser()
    if (user.error !== null) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const query = parseQuery(await request.json().catch(() => null))
    if (query === null) {
      return jsonResponse({ error: 'invalid_position' }, 400)
    }

    const service = createClient(
      supabaseUrl,
      env('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    )
    const gridKey = lookupGridKey(query)

    const cached = await service
      .from('place_lookups')
      .select(`place_id, places (${PLACE_COLUMNS})`)
      .eq('grid_key', gridKey)
      .maybeSingle()
    if (cached.data !== null) {
      const place = cached.data.places as unknown as PlaceRow | null
      return jsonResponse({
        cached: true,
        place: place === null ? null : toResponsePlace(place),
      })
    }

    let candidate = await geoapifyPlace(query, Deno.env.get('GEOAPIFY_API_KEY'))
    let source = GEOAPIFY_GEOCODE_SOURCE
    if (candidate === null) {
      candidate = placeFromMapyResult(await reverse(query, mapyKey), query)
      source = PLACE_GEOCODE_SOURCE
    }

    const place =
      candidate === null ? null : await storePlace(service, candidate, source)
    await service
      .from('place_lookups')
      .upsert(
        { grid_key: gridKey, place_id: place?.id ?? null },
        { ignoreDuplicates: true, onConflict: 'grid_key' },
      )

    return jsonResponse({
      cached: false,
      place: place === null ? null : toResponsePlace(place),
    })
  } catch (error) {
    console.error('resolve-place failed', error)
    return jsonResponse({ error: 'geocoding_failed' }, 502)
  }
})
