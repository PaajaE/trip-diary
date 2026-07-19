import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export const SIGNED_PHOTO_URL_TTL_SECONDS = 60 * 60

export async function createSignedPhotoUrl(
  storagePath: string,
  ttlSeconds: number = SIGNED_PHOTO_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!isSupabaseConfigured() || storagePath.trim().length === 0) {
    return null
  }

  const { data, error } = await getSupabaseClient()
    .storage.from('photos')
    .createSignedUrl(storagePath, ttlSeconds)

  if (error !== null || typeof data.signedUrl !== 'string') {
    return null
  }

  return data.signedUrl
}

export async function createSignedPhotoUrls(
  storagePaths: string[],
  ttlSeconds: number = SIGNED_PHOTO_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const uniquePaths = [
    ...new Set(storagePaths.filter((path) => path.trim().length > 0)),
  ]

  if (uniquePaths.length === 0 || !isSupabaseConfigured()) {
    return result
  }

  const client = getSupabaseClient()
  const { data, error } = await client.storage
    .from('photos')
    .createSignedUrls(uniquePaths, ttlSeconds)

  if (error !== null) {
    await Promise.all(
      uniquePaths.map(async (path) => {
        const signed = await createSignedPhotoUrl(path, ttlSeconds)
        if (signed !== null) {
          result.set(path, signed)
        }
      }),
    )
    return result
  }

  for (const item of data) {
    if (
      typeof item.path === 'string' &&
      typeof item.signedUrl === 'string' &&
      item.error === null
    ) {
      result.set(item.path, item.signedUrl)
    }
  }

  return result
}
