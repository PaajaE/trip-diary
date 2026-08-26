import { buildVideoStoragePath } from '@trip-diary/utils'
import { getSupabaseClient } from '@/shared/api/supabase'

const SIGNED_VIDEO_URL_TTL_SECONDS = 60 * 60

export async function getPhotoVideoSignedUrl(
  photoId: string,
  creatorId: string,
): Promise<string | null> {
  const client = getSupabaseClient()
  const storagePath = buildVideoStoragePath(creatorId, photoId)
  const { data, error } = await client.storage
    .from('photos')
    .createSignedUrl(storagePath, SIGNED_VIDEO_URL_TTL_SECONDS)

  if (error !== null || typeof data.signedUrl !== 'string') {
    return null
  }

  return data.signedUrl
}

export async function resolvePhotoVideoSignedUrl(
  photoId: string,
): Promise<string | null> {
  const client = getSupabaseClient()
  const { data: variant, error: variantError } = await client
    .from('photo_variants')
    .select('creator_id, storage_path')
    .eq('photo_id', photoId)
    .eq('variant', 'video')
    .maybeSingle()

  if (variantError !== null || variant === null) {
    return null
  }

  const { data, error } = await client.storage
    .from('photos')
    .createSignedUrl(variant.storage_path, SIGNED_VIDEO_URL_TTL_SECONDS)

  if (error !== null || typeof data.signedUrl !== 'string') {
    return null
  }

  return data.signedUrl
}
