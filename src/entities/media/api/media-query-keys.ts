export const mediaQueryKeys = {
  all: ['media'] as const,
  detail: (mediaId: string) => ['media', 'detail', mediaId] as const,
  journey: (journeyId: string) => ['media', 'journey', journeyId] as const,
  trash: (journeyId: string) => ['media', 'trash', journeyId] as const,
  // Nested under `journey`, so invalidateJourneyTree (every workspace edit,
  // trash, restore) refreshes the batch inbox and its counter too.
  unreviewed: (journeyId: string) =>
    ['media', 'journey', journeyId, 'unreviewed'] as const,
  unreviewedCount: (journeyId: string) =>
    ['media', 'journey', journeyId, 'unreviewed-count'] as const,
} as const
