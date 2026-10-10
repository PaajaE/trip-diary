export const mediaQueryKeys = {
  all: ['media'] as const,
  detail: (mediaId: string) => ['media', 'detail', mediaId] as const,
  journey: (journeyId: string) => ['media', 'journey', journeyId] as const,
} as const
