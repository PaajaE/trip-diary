export interface NatureGuideBboxKey {
  maxLatitude?: number
  maxLongitude?: number
  minLatitude?: number
  minLongitude?: number
}

export const natureQueryKeys = {
  observationsAll: ['journey-observations'] as const,
  journeyObservations: (journeyId: string) =>
    ['journey-observations', journeyId] as const,
  regionalGuide: (journeyId: string, bbox: NatureGuideBboxKey | null) =>
    [
      'nature-guide-regional',
      journeyId,
      bbox?.minLatitude,
      bbox?.minLongitude,
      bbox?.maxLatitude,
      bbox?.maxLongitude,
    ] as const,
  wiki: (commonName: string | undefined, language: string) =>
    ['nature-guide-wiki', commonName, language] as const,
  wikidata: (
    scientificName: string | null | undefined,
    commonName: string | null | undefined,
    language: string,
  ) =>
    [
      'nature-guide-wikidata',
      scientificName,
      commonName,
      language,
    ] as const,
  taxonSearch: (query: string, language: string) =>
    ['inaturalist-taxon-search', query, language] as const,
  macrostratGeology: (
    stratName: string,
    latitude: number | null,
    longitude: number | null,
  ) => ['macrostrat-geology', stratName, latitude, longitude] as const,
} as const
