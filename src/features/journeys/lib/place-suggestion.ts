interface ReverseGeocodeResponse {
  address?: {
    city?: string
    city_district?: string
    country?: string
    county?: string
    hamlet?: string
    municipality?: string
    neighbourhood?: string
    quarter?: string
    region?: string
    state?: string
    suburb?: string
    town?: string
    village?: string
  }
  display_name?: string
  name?: string
}

export async function suggestPlaceLabel(input: {
  latitude: number
  longitude: number
  language: string
  signal?: AbortSignal
}): Promise<string | null> {
  const params = new URLSearchParams({
    'accept-language': input.language,
    format: 'jsonv2',
    lat: String(input.latitude),
    lon: String(input.longitude),
    zoom: '14',
  })
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
    {
      headers: { Accept: 'application/json' },
      signal: input.signal ?? null,
    },
  )

  if (!response.ok) {
    throw new Error('Reverse geocoding failed')
  }

  const result = (await response.json()) as ReverseGeocodeResponse
  return buildPlaceLabel(result)
}

function buildPlaceLabel(result: ReverseGeocodeResponse): string | null {
  const parts = unique(
    [
      result.name,
      result.address?.neighbourhood,
      result.address?.suburb,
      result.address?.quarter,
      result.address?.hamlet,
      result.address?.village,
      result.address?.town,
      result.address?.city,
      result.address?.municipality,
      result.address?.county,
      result.address?.region,
      result.address?.state,
      result.address?.country,
    ].filter(isPresent),
  )

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`
  }
  if (parts.length === 1) {
    return parts[0] ?? null
  }

  const fallback = result.display_name?.split(',').slice(0, 2).join(',').trim()
  return fallback === undefined || fallback === '' ? null : fallback
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== ''
}
