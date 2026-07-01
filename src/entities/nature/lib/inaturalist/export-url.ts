export function buildINaturalistObservationUrl(input: {
  commonName?: string
  latitude?: number | null
  longitude?: number | null
  scientificName?: string | null
}): string {
  const params = new URLSearchParams()
  const scientific = input.scientificName?.trim()
  const common = input.commonName?.trim()
  const taxonName =
    scientific !== undefined && scientific.length > 0 ? scientific : common
  if (taxonName !== undefined && taxonName.length > 0) {
    params.set('taxon_name', taxonName)
  }
  if (
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    params.set('latitude', String(input.latitude))
    params.set('longitude', String(input.longitude))
  }

  const query = params.toString()
  return query.length > 0
    ? `https://www.inaturalist.org/observations/new?${query}`
    : 'https://www.inaturalist.org/observations/new'
}
