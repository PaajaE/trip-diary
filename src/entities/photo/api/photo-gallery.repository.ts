import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'

export interface PhotoPreview {
  blob: Blob
  id: string
}

interface PositionedPhotoPreview extends PhotoPreview {
  position: number
}

async function getLocalPhotoPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  const photos = await localDb.photos
    .where('entryId')
    .equals(entryId)
    .sortBy('position')
  const previews = await Promise.allSettled(
    photos.map(async (photo) => {
      const variant = await localDb.photoVariants.get(`${photo.id}:thumb`)
      return variant === undefined
        ? null
        : { blob: variant.blob, id: photo.id, position: photo.position }
    }),
  )

  return previews.flatMap((preview) =>
    preview.status === 'fulfilled' && preview.value !== null
      ? [preview.value]
      : [],
  )
}

async function getRemotePhotoPreviews(
  entryId: string,
): Promise<PositionedPhotoPreview[]> {
  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('photo_id, position')
    .eq('entry_id', entryId)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }

  const previews = await Promise.allSettled(
    links.map(async (link) => {
      const { data: variant, error: variantError } = await client
        .from('photo_variants')
        .select('storage_path')
        .eq('photo_id', link.photo_id)
        .eq('variant', 'preview')
        .single()
      if (variantError !== null) {
        throw variantError
      }
      const { data: blob, error: downloadError } = await client.storage
        .from('photos')
        .download(variant.storage_path)
      if (downloadError !== null) {
        throw downloadError
      }
      return { blob, id: link.photo_id, position: link.position }
    }),
  )

  return previews.flatMap((preview) =>
    preview.status === 'fulfilled' ? [preview.value] : [],
  )
}

export async function getEntryPhotoPreviews(
  entryId: string,
): Promise<PhotoPreview[]> {
  const [localResult, remoteResult] = await Promise.allSettled([
    getLocalPhotoPreviews(entryId),
    getRemotePhotoPreviews(entryId),
  ])

  if (localResult.status === 'rejected' && remoteResult.status === 'rejected') {
    throw new AggregateError(
      [localResult.reason, remoteResult.reason],
      'Photo previews could not be loaded',
    )
  }
  if (
    localResult.status === 'rejected' &&
    remoteResult.status === 'fulfilled' &&
    remoteResult.value.length === 0
  ) {
    throw localResult.reason
  }
  if (
    remoteResult.status === 'rejected' &&
    localResult.status === 'fulfilled' &&
    localResult.value.length === 0
  ) {
    throw remoteResult.reason
  }

  const previewsById = new Map<string, PositionedPhotoPreview>()
  if (remoteResult.status === 'fulfilled') {
    for (const preview of remoteResult.value) {
      previewsById.set(preview.id, preview)
    }
  }
  if (localResult.status === 'fulfilled') {
    for (const preview of localResult.value) {
      previewsById.set(preview.id, preview)
    }
  }

  return [...previewsById.values()]
    .sort((left, right) => left.position - right.position)
    .map(({ blob, id }) => ({ blob, id }))
}
