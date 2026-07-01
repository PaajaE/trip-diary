import { handleOptions, jsonResponse } from '../_shared/http.ts'

interface IdentifyRequestBody {
  imageBase64: string
  latitude?: number | null
  longitude?: number | null
  mimeType?: string
}

interface IdentifySuggestion {
  commonName: string
  iconicTaxon: string | null
  score: number
  scientificName: string
  taxonId: number
}

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
): IdentifySuggestion[] {
  const suggestions: IdentifySuggestion[] = []

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

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options !== null) {
    return options
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const token = Deno.env.get('INATURALIST_API_TOKEN')
  if (token === undefined || token.trim() === '') {
    return jsonResponse({ error: 'not_configured' }, 503)
  }

  try {
    const body = (await request.json()) as IdentifyRequestBody
    if (body.imageBase64.trim() === '') {
      return jsonResponse({ error: 'missing_image' }, 400)
    }
    if (body.imageBase64.length > 4_000_000) {
      return jsonResponse({ error: 'image_too_large' }, 413)
    }

    const mimeType = body.mimeType ?? 'image/jpeg'
    const bytes = base64ToUint8Array(body.imageBase64)
    const form = new FormData()
    form.append('image', new Blob([bytes], { type: mimeType }), 'photo.jpg')

    if (
      body.latitude != null &&
      body.longitude != null &&
      Number.isFinite(body.latitude) &&
      Number.isFinite(body.longitude)
    ) {
      form.append('lat', String(body.latitude))
      form.append('lng', String(body.longitude))
    }

    const response = await fetch(
      'https://api.inaturalist.org/v1/computervision/score_image',
      {
        body: form,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        method: 'POST',
      },
    )

    if (!response.ok) {
      console.error('[nature-identify] iNat status', response.status)
      return jsonResponse({ error: 'identify_failed' }, 502)
    }

    const payload = (await response.json()) as InaturalistScoreImageResponse
    const suggestions = parseInaturalistIdentifyResponse(payload)

    return jsonResponse({ suggestions })
  } catch (error) {
    console.error('[nature-identify]', error)
    return jsonResponse({ error: 'identify_failed' }, 502)
  }
})
