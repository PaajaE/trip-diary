export const placeQueryKeys = {
  journey: (journeyId: string) => ['places', 'journey', journeyId] as const,
} as const
