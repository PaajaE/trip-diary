import { buildVideoStoragePath } from '@trip-diary/utils'
import { createSignedPhotoUrls } from '@/features/photos/api/signed-photo-url'
import {
  groupVariantsByPhotoId,
  pickCardPhotoVariantPath,
  pickDetailPhotoVariantPath,
} from '@/features/photos/lib/pick-photo-variant-path'
import { readMeaningfulPhotoGps } from '@/features/photos/lib/read-photo-coordinate'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export class JourneyGalleryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JourneyGalleryError'
  }
}

export interface JourneyGalleryPhoto {
  entryId: string
  entryTitle: string | null
  id: string
  isCover: boolean
  latitude: number | null
  longitude: number | null
  mediaType: 'photo' | 'video'
  position: number
  previewUrl: string | null
  videoStoragePath: string | null
}

export async function listJourneyGalleryPhotos(
  journeyId: string,
  entryIds: string[],
  entryTitles: Map<string, string | null> = new Map(),
): Promise<JourneyGalleryPhoto[]> {
  if (entryIds.length === 0) {
    return []
  }

  if (!isSupabaseConfigured()) {
    throw new JourneyGalleryError('Supabase is not configured.')
  }

  const client = getSupabaseClient()
  const uniqueEntryIds = [...new Set(entryIds)]

  // Scope to this journey so callers cannot leak photos from other journeys
  // even if they pass a stale or overly broad entry id list.
  const { data: journeyLinks, error: journeyLinksError } = await client
    .from('entry_journey_links')
    .select('entry_id')
    .eq('journey_id', journeyId)
    .in('entry_id', uniqueEntryIds)

  if (journeyLinksError !== null) {
    throw new JourneyGalleryError(journeyLinksError.message)
  }

  const scopedEntryIds = [
    ...new Set(journeyLinks.map((link) => String(link.entry_id))),
  ]
  if (scopedEntryIds.length === 0) {
    return []
  }

  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id, position, is_cover')
    .in('entry_id', scopedEntryIds)
    .order('position')

  if (linksError !== null) {
    throw new JourneyGalleryError(linksError.message)
  }

  if (links.length === 0) {
    return []
  }

  const photoIds = [...new Set(links.map((link) => String(link.photo_id)))]
  const [
    { data: photos, error: photosError },
    { data: variants, error: variantsError },
  ] = await Promise.all([
    client
      .from('photos')
      .select('id, latitude, longitude, media_type, creator_id')
      .in('id', photoIds),
    client
      .from('photo_variants')
      .select('photo_id, storage_path, variant')
      .in('photo_id', photoIds),
  ])

  if (photosError !== null) {
    throw new JourneyGalleryError(photosError.message)
  }

  if (variantsError !== null) {
    throw new JourneyGalleryError(variantsError.message)
  }

  const photoById = new Map(photos.map((photo) => [String(photo.id), photo]))
  const variantsByPhotoId = groupVariantsByPhotoId(variants)

  const storagePathByPhotoId = new Map<string, string>()
  for (const photoId of photoIds) {
    const path = pickCardPhotoVariantPath(variantsByPhotoId.get(photoId) ?? [])
    if (path !== null) {
      storagePathByPhotoId.set(photoId, path)
    }
  }

  const signedByPath = await createSignedPhotoUrls([
    ...storagePathByPhotoId.values(),
  ])

  const byPhotoId = new Map<string, JourneyGalleryPhoto>()

  for (const link of links) {
    const photoId = String(link.photo_id)
    if (byPhotoId.has(photoId)) {
      continue
    }

    const entryId = String(link.entry_id)
    const photo = photoById.get(photoId)
    const storagePath = storagePathByPhotoId.get(photoId)
    const previewUrl =
      storagePath !== undefined ? (signedByPath.get(storagePath) ?? null) : null
    const coords = readMeaningfulPhotoGps(photo?.latitude, photo?.longitude)
    const mediaType =
      photo !== undefined && photo.media_type === 'video' ? 'video' : 'photo'
    const creatorId =
      photo !== undefined && typeof photo.creator_id === 'string'
        ? photo.creator_id
        : null
    const videoStoragePath =
      mediaType === 'video' && creatorId !== null
        ? buildVideoStoragePath(creatorId, photoId)
        : null

    byPhotoId.set(photoId, {
      entryId,
      entryTitle: entryTitles.get(entryId) ?? null,
      id: photoId,
      isCover: link.is_cover === true,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      mediaType,
      position: typeof link.position === 'number' ? link.position : 0,
      previewUrl,
      videoStoragePath,
    })
  }

  return [...byPhotoId.values()].sort((left, right) => {
    const coverDelta = Number(right.isCover) - Number(left.isCover)
    if (coverDelta !== 0) {
      return coverDelta
    }
    if (left.position !== right.position) {
      return left.position - right.position
    }
    return left.id.localeCompare(right.id)
  })
}

export async function resolveJourneyCoverPreviewUrl(
  journeyId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_journey_links')
    .select('entry_id')
    .eq('journey_id', journeyId)

  if (linksError !== null || links.length === 0) {
    return null
  }

  const entryIds = links.map((link) => String(link.entry_id))
  const { data: photos, error: photosError } = await client
    .from('entry_photos')
    .select('entry_id, photo_id, position, is_cover')
    .in('entry_id', entryIds)
    .order('position')

  if (photosError !== null || photos.length === 0) {
    return null
  }

  let coverPhotoId: string | null = null
  for (const row of photos) {
    if (row.is_cover === true) {
      coverPhotoId = String(row.photo_id)
      break
    }
  }
  coverPhotoId ??= String(photos[0].photo_id)

  const { data: variants, error: variantsError } = await client
    .from('photo_variants')
    .select('photo_id, storage_path, variant')
    .eq('photo_id', coverPhotoId)

  if (variantsError !== null) {
    return null
  }

  const storagePath = pickCardPhotoVariantPath(
    variants.map((variant) => ({
      photoId: String(variant.photo_id),
      storagePath: String(variant.storage_path),
      variant: String(variant.variant),
    })),
  )

  if (storagePath === null) {
    return null
  }

  const signed = await createSignedPhotoUrls([storagePath])
  return signed.get(storagePath) ?? null
}

export async function resolveJourneyCoverPreviewUrls(
  journeyIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  await Promise.all(
    journeyIds.map(async (journeyId) => {
      const url = await resolveJourneyCoverPreviewUrl(journeyId)
      if (url !== null) {
        result.set(journeyId, url)
      }
    }),
  )
  return result
}

export { pickDetailPhotoVariantPath }
