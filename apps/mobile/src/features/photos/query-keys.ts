export const photoQueryKeys = {
  journeyGallery: (journeyId: string) =>
    ['journey-gallery', journeyId] as const,
  journeyGalleryRoot: ['journey-gallery'] as const,
  journeyListCover: (journeyId: string) =>
    ['journey-list-cover', journeyId] as const,
  journeyListCoverRoot: ['journey-list-cover'] as const,
  journeyPhotoLocations: (journeyId: string) =>
    ['journey-photo-locations', journeyId] as const,
  journeyPhotoLocationsRoot: ['journey-photo-locations'] as const,
}

/** Signed URLs last 1 hour; refresh well before expiry. */
export const PHOTO_SIGNED_URL_STALE_TIME_MS = 45 * 60 * 1000
