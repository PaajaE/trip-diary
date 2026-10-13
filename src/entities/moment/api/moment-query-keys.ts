export const momentQueryKeys = {
  all: ['moments'] as const,
  journey: (journeyId: string) => ['moments', 'journey', journeyId] as const,
} as const
