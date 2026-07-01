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

export function aggregateGbifResults(
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
