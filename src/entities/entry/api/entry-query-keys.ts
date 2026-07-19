export const entryQueryKeys = {
  all: ['entries'] as const,
  detail: (entryId: string) => ['entries', entryId] as const,
  public: (entryId: string) => ['entries', entryId, 'public'] as const,
  photoPreviews: (entryId: string) =>
    ['entries', entryId, 'photo-previews'] as const,
  photoDetailPreviews: (entryId: string) =>
    ['entries', entryId, 'photo-detail-previews'] as const,
  publicMomentPhotos: (entryId: string) =>
    ['entries', entryId, 'public-moment-photos'] as const,
  inlineEdit: (entryId: string) => ['entries', entryId, 'inline-edit'] as const,
  publicCardThumb: (entryId: string) =>
    ['entries', entryId, 'public-card-thumb'] as const,
} as const
