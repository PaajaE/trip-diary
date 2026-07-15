export const checklistQueryKeys = {
  all: ['journey-checklist'] as const,
  journey: (journeyId: string) => ['journey-checklist', journeyId] as const,
} as const
