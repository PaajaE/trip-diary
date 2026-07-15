export const photoQueryKeys = {
  journeyGalleryRoot: ['journey-gallery'] as const,
  journeyGallery: (
    entryIds: readonly string[],
    quality: 'detail' | 'thumb' = 'thumb',
  ) => ['journey-gallery', quality, ...entryIds] as const,
  journeyGalleryByEntries: (entryIds: readonly string[]) =>
    ['journey-gallery', ...entryIds] as const,
  journeyPhotoLocations: (journeyId: string, entryIds: readonly string[]) =>
    ['journey-photo-locations', journeyId, ...entryIds] as const,
  journeyPhotoLocationsPrefix: (journeyId: string) =>
    ['journey-photo-locations', journeyId] as const,
  journeyTagsRoot: ['journey-photo-tags'] as const,
  journeyTags: (journeyId: string) => ['journey-photo-tags', journeyId] as const,
  journeyTagAssignments: (journeyId: string) =>
    ['journey-photo-tags', journeyId, 'assignments'] as const,
  journeyTagsForEntry: (
    journeyId: string,
    entryId: string,
    photoIds: readonly string[],
  ) =>
    ['journey-photo-tags', journeyId, 'entry', entryId, ...photoIds] as const,
} as const
