export const publicJourneyQueryKeys = {
  detail: (spaceHandle: string, journeySlug: string) =>
    ['public-journey-v2', spaceHandle, journeySlug] as const,
} as const
