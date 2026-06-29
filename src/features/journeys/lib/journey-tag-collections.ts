import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type { JourneyGalleryPhoto } from '@/features/journeys/lib/journey-gallery'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMapPoint } from '@/features/journeys/ui/journey-map-points'

export function groupTagsByPhotoId(
  assignments: PhotoTagAssignment[],
): Map<string, PhotoTagAssignment[]> {
  const grouped = new Map<string, PhotoTagAssignment[]>()
  for (const assignment of assignments) {
    const current = grouped.get(assignment.photoId) ?? []
    current.push(assignment)
    grouped.set(assignment.photoId, current)
  }
  return grouped
}

export function filterGalleryPhotosByTag(
  photos: JourneyGalleryPhoto[],
  assignments: PhotoTagAssignment[],
  tagSlug: string | null,
): JourneyGalleryPhoto[] {
  if (tagSlug === null) {
    return photos
  }

  const photoIds = new Set(
    assignments
      .filter((assignment) => assignment.slug === tagSlug)
      .map((assignment) => assignment.photoId),
  )
  return photos.filter((photo) => photoIds.has(photo.id))
}

export function filterPhotoLocationsByTag(
  locations: JourneyPhotoLocation[],
  assignments: PhotoTagAssignment[],
  tagSlug: string | null,
): JourneyPhotoLocation[] {
  if (tagSlug === null) {
    return locations
  }

  const photoIds = new Set(
    assignments
      .filter((assignment) => assignment.slug === tagSlug)
      .map((assignment) => assignment.photoId),
  )
  return locations.filter((location) => photoIds.has(location.id))
}

export function filterMapPointsByPhotoIds(
  points: JourneyMapPoint[],
  photoIds: ReadonlySet<string>,
): JourneyMapPoint[] {
  if (photoIds.size === 0) {
    return []
  }

  return points.filter(
    (point) =>
      point.type === 'photo' &&
      point.photoId !== null &&
      photoIds.has(point.photoId),
  )
}
