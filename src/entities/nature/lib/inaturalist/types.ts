export interface InaturalistTaxonSuggestion {
  commonName: string
  id: number
  rank: string
  scientificName: string
}

export interface InaturalistTaxonMatch {
  commonName: string
  iconicTaxon: string | null
  localObservationCount: number
  scientificName: string
  taxonId: number
}

export interface InaturalistTaxonDetail {
  commonName: string
  iconicTaxon: string | null
  observationCount: number
  scientificName: string
  taxonId: number
  wikipediaUrl: string | null
}
