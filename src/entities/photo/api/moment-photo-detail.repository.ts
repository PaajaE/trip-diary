import { getSupabaseClient } from '@/shared/api/supabase'
import { createPreviewUrl } from '@/shared/lib/preview-url'
import { isValidPhotoMapCoordinate } from '@trip-diary/utils'
import {
  COVER_FOCAL_CENTER,
  normalizeCoverFocalPoint,
  type CoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'

export const MOMENT_PHOTO_PREVIEW_LIMIT = 5
export const PHOTO_CAPTION_MAX_LENGTH = 500

export interface MomentPhotoMeta {
  caption: string | null
  capturedAt: string | null
  focalX: number | null
  focalY: number | null
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

function compareMomentPhotos(
  left: MomentPhotoMeta,
  right: MomentPhotoMeta,
): number {
  const coverDelta = Number(right.isCover) - Number(left.isCover)
  if (coverDelta !== 0) {
    return coverDelta
  }
  return left.position - right.position
}

async function downloadThumbUrl(storagePath: string): Promise<string | null> {
  const client = getSupabaseClient()
  const { data, error } = await client.storage
    .from('photos')
    .download(storagePath)
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
    .select('photo_id, position, is_cover, caption, focal_x, focal_y')
    .eq('entry_id', entryId)
    .order('position')

  if (linksError !== null) {
    throw linksError
  }

  if (links.length === 0) {
    return { cover: null, photos: [], preview: [], totalCount: 0 }
  }

  const photoIds = links.map((link) => link.photo_id)
  const [
    { data: photos, error: photosError },
    { data: variants, error: variantsError },
  ] = await Promise.all([
    client
      .from('photos')
      .select('id, latitude, longitude, captured_at')
      .in('id', photoIds),
    client
      .from('photo_variants')
      .select('photo_id, storage_path, variant')
      .in('photo_id', photoIds)
      .in('variant', ['thumb', 'small', 'medium', 'full', 'preview', 'large']),
  ])

  if (photosError !== null) {
    throw photosError
  }
  if (variantsError !== null) {
    throw variantsError
  }

  const photoById = new Map(photos.map((photo) => [photo.id, photo]))
  const variantsByPhotoId = new Map<
    string,
    { storage_path: string; variant: string }[]
  >()
  for (const variant of variants) {
    const list = variantsByPhotoId.get(variant.photo_id) ?? []
    list.push(variant)
    variantsByPhotoId.set(variant.photo_id, list)
  }

  /** Mosaic tiles: prefer small (~800); never start at thumb for ~half-width tiles. */
  const mosaicPreference = [
    'small',
    'thumb',
    'medium',
    'full',
    'preview',
    'large',
  ] as const
  /** Cover blob fallback only; hero UI prefers signed srcset (small/medium/full). */
  const coverFallbackPreference = [
    'small',
    'medium',
    'full',
    'preview',
    'large',
    'thumb',
  ] as const

  function pickPath(
    photoId: string,
    preference: readonly string[],
  ): string | undefined {
    const rows = variantsByPhotoId.get(photoId) ?? []
    for (const kind of preference) {
      const match = rows.find((row) => row.variant === kind)
      if (match !== undefined) {
        return match.storage_path
      }
    }
    return undefined
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
        focalX: link.is_cover
          ? (normalizeCoverFocalPoint(link.focal_x, link.focal_y)?.x ?? null)
          : null,
        focalY: link.is_cover
          ? (normalizeCoverFocalPoint(link.focal_x, link.focal_y)?.y ?? null)
          : null,
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
      const path =
        photoId === coverMeta?.id
          ? pickPath(photoId, coverFallbackPreference)
          : pickPath(photoId, mosaicPreference)
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

export async function updateEntryCoverFocalPoint(
  entryId: string,
  photoId: string,
  focal: CoverFocalPoint | null,
): Promise<void> {
  const normalized =
    focal === null ||
    (focal.x === COVER_FOCAL_CENTER.x && focal.y === COVER_FOCAL_CENTER.y)
      ? { focal_x: null, focal_y: null }
      : {
          focal_x: normalizeCoverFocalPoint(focal.x, focal.y)?.x ?? null,
          focal_y: normalizeCoverFocalPoint(focal.x, focal.y)?.y ?? null,
        }

  const { error } = await getSupabaseClient()
    .from('entry_photos')
    .update(normalized)
    .eq('entry_id', entryId)
    .eq('photo_id', photoId)
    .eq('is_cover', true)

  if (error !== null) {
    throw error
  }
}
