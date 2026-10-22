export const dayNoteQueryKeys = {
  all: ['day-notes'] as const,
  journey: (journeyId: string) => ['day-notes', 'journey', journeyId] as const,
} as const
