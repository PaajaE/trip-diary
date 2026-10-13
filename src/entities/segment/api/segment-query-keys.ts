export const segmentQueryKeys = {
  all: ['segments'] as const,
  journey: (journeyId: string) => ['segments', 'journey', journeyId] as const,
} as const
