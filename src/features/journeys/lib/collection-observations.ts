import type { NatureObservation } from '@/entities/nature/model/observation'

const TAG_TO_CATEGORY: Record<string, NatureObservation['category']> = {
  flowers: 'flora',
  geology: 'geology',
  wildlife: 'wildlife',
}

export function observationCategoryForTagSlug(
  tagSlug: string,
): NatureObservation['category'] | null {
  return TAG_TO_CATEGORY[tagSlug] ?? null
}

export function observationsForCollectionTag(
  observations: NatureObservation[],
  tagSlug: string,
): NatureObservation[] {
  const category = observationCategoryForTagSlug(tagSlug)
  if (category === null) {
    return []
  }
  return observations.filter((observation) => observation.category === category)
}

export function uniqueSpeciesNames(
  observations: NatureObservation[],
): string[] {
  return [
    ...new Set(
      observations
        .map((observation) => observation.commonName.trim())
        .filter((name) => name.length > 0),
    ),
  ]
}
