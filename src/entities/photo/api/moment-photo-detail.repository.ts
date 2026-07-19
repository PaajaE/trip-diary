import { getSupabaseClient } from '@/shared/api/supabase'
import { createPreviewUrl } from '@/shared/lib/preview-url'
import { isValidPhotoMapCoordinate } from '@trip-diary/utils'

export const MOMENT_PHOTO_PREVIEW_LIMIT = 5
export const PHOTO_CAPTION_MAX_LENGTH = 500

export interface MomentPhotoMeta {
  caption: string | null
  capturedAt: string | null
  id: string
  isCover: boolean
  latitude: number | null
  longitude: number | null
  position: number
}

export interface MomentPhotoThumb extends MomentPhotoMeta {
  thumbUrl: string
}

export interface PublicMomentPhotos {
  cover: MomentPhotoThumb | null
  photos: MomentPhotoMeta[]
  preview: MomentPhotoThumb[]
  totalCount: number
}

function compareMomentPhotos(left: MomentPhotoMeta, right: MomentPhotoMeta): number {
  const coverDelta = Number(right.isCover) - Number(left.isCover)
  if (coverDelta !== 0) {
    return coverDelta
  }
  return left.position - right.position
}

async function downloadThumbUrl(storagePath: string): Promise<string | null> {
  const client = getSupabaseClient()
  const { data, error } = await client.storage.from('photos').download(storagePath)
  if (error !== null || data.size === 0) {
    return null
  }
  return createPreviewUrl(data)
}

/**
 * Public moment photo payload: full metadata for every photo, but only
 * downloads thumb blobs for the cover + a compact preview mosaic.
 */
export async function getPublicMomentPhotos(
  entryId: string,
): Promise<PublicMomentPhotos> {
  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('photo_id, position, is_cover, caption')
    .eq('entry_id', entryId)
    .order('position')

  if (linksError !== null) {
    throw linksError
  }

  if (links.length === 0) {
    return { cover: null, photos: [], preview: [], totalCount: 0 }
  }

  const photoIds = links.map((link) => link.photo_id)
  const [{ data: photos, error: photosError }, { data: variants, error: variantsError }] =
    await Promise.all([
      client
        .from('photos')
        .select('id, latitude, longitude, captured_at')
        .in('id', photoIds),
      client
        .from('photo_variants')
        .select('photo_id, storage_path, variant')
        .in('photo_id', photoIds)
        .in('variant', ['thumb', 'preview']),
    ])

  if (photosError !== null) {
    throw photosError
  }
  if (variantsError !== null) {
    throw variantsError
  }

  const photoById = new Map(photos.map((photo) => [photo.id, photo]))
  const thumbPathByPhotoId = new Map<string, string>()
  for (const variant of variants) {
    const photoId = variant.photo_id
    if (variant.variant === 'thumb') {
      thumbPathByPhotoId.set(photoId, variant.storage_path)
      continue
    }
    if (!thumbPathByPhotoId.has(photoId) && variant.variant === 'preview') {
      thumbPathByPhotoId.set(photoId, variant.storage_path)
    }
  }

  const metas: MomentPhotoMeta[] = links
    .map((link) => {
      const photoId = link.photo_id
      const photo = photoById.get(photoId)
      const latitude =
        typeof photo?.latitude === 'number' ? photo.latitude : null
      const longitude =
        typeof photo?.longitude === 'number' ? photo.longitude : null
      const coords = isValidPhotoMapCoordinate(latitude, longitude)
        ? { latitude, longitude }
        : { latitude: null, longitude: null }

      return {
        caption:
          typeof link.caption === 'string' && link.caption.trim().length > 0
            ? link.caption.trim()
            : null,
        capturedAt:
          typeof photo?.captured_at === 'string' ? photo.captured_at : null,
        id: photoId,
        isCover: link.is_cover,
        latitude: coords.latitude,
        longitude: coords.longitude,
        position: typeof link.position === 'number' ? link.position : 0,
      } satisfies MomentPhotoMeta
    })
    .sort(compareMomentPhotos)

  const coverMeta = metas.find((photo) => photo.isCover) ?? metas[0] ?? null
  const previewMetas = metas
    .filter((photo) => photo.id !== coverMeta?.id)
    .slice(0, MOMENT_PHOTO_PREVIEW_LIMIT)
  const downloadIds = new Set(
    [coverMeta?.id, ...previewMetas.map((photo) => photo.id)].filter(
      (id): id is string => id !== undefined,
    ),
  )

  const urlById = new Map<string, string>()
  await Promise.all(
    [...downloadIds].map(async (photoId) => {
      const path = thumbPathByPhotoId.get(photoId)
      if (path === undefined) {
        return
      }
      const url = await downloadThumbUrl(path)
      if (url !== null) {
        urlById.set(photoId, url)
      }
    }),
  )

  const toThumb = (meta: MomentPhotoMeta): MomentPhotoThumb | null => {
    const thumbUrl = urlById.get(meta.id)
    if (thumbUrl === undefined) {
      return null
    }
    return { ...meta, thumbUrl }
  }

  return {
    cover: coverMeta !== null ? toThumb(coverMeta) : null,
    photos: metas,
    preview: previewMetas
      .map(toThumb)
      .filter((photo): photo is MomentPhotoThumb => photo !== null),
    totalCount: metas.length,
  }
}

export async function updateEntryPhotoCaption(
  entryId: string,
  photoId: string,
  caption: string | null,
): Promise<void> {
  const normalized =
    caption === null || caption.trim().length === 0
      ? null
      : caption.trim().slice(0, PHOTO_CAPTION_MAX_LENGTH)

  const { error } = await getSupabaseClient()
    .from('entry_photos')
    .update({ caption: normalized })
    .eq('entry_id', entryId)
    .eq('photo_id', photoId)

  if (error !== null) {
    throw error
  }
}
