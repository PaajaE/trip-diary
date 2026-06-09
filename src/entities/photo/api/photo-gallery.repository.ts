import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'

export interface PhotoPreview {
  blob: Blob
  id: string
}

export async function getEntryPhotoPreviews(
  entryId: string,
): Promise<PhotoPreview[]> {
  const localPhotos = await localDb.photos
    .where('entryId')
    .equals(entryId)
    .sortBy('position')

  if (localPhotos.length > 0) {
    const previews = await Promise.all(
      localPhotos.map(async (photo) => {
        const variant = await localDb.photoVariants.get(`${photo.id}:thumb`)
        return variant === undefined
          ? null
          : { blob: variant.blob, id: photo.id }
      }),
    )
    return previews.filter((preview) => preview !== null)
  }

  const client = getSupabaseClient()
  const { data: links, error: linksError } = await client
    .from('entry_photos')
    .select('photo_id, position')
    .eq('entry_id', entryId)
    .order('position')
  if (linksError !== null) {
    throw linksError
  }

  const previews: PhotoPreview[] = []
  for (const link of links) {
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
    previews.push({ blob, id: link.photo_id })
  }

  return previews
}
