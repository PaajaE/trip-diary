export const tagQueryKeys = {
  all: ['tags'] as const,
  catalog: (userId: string) => ['tags', 'catalog', userId] as const,
  species: (language: string, query: string) =>
    ['tags', 'species', language, query] as const,
  /** Prefix for every moment-tag query of the journey. */
  journey: (journeyId: string) => ['tags', 'moments', journeyId] as const,
  /** The id set is part of the key, so new moments load their tags. */
  moments: (journeyId: string, momentIds: string[]) =>
    ['tags', 'moments', journeyId, momentIds.join(',')] as const,
} as const
