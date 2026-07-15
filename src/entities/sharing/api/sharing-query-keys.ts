export const sharingQueryKeys = {
  publicSpace: (spaceHandle: string) => ['public-space', spaceHandle] as const,
  publicJourneyMeta: (spaceHandle: string, journeySlug: string) =>
    ['public-journey-meta', spaceHandle, journeySlug] as const,
  publicEntry: (spaceHandle: string, entrySlug: string) =>
    ['public-entry', spaceHandle, entrySlug] as const,
  publicJourneyEntry: (
    spaceHandle: string,
    journeySlug: string,
    entrySlug: string,
  ) =>
    ['public-journey-entry', spaceHandle, journeySlug, entrySlug] as const,
  entryPublicShare: (entryId: string) =>
    ['entry-public-share', entryId] as const,
} as const
