import { createPreviewUrl, revokePreviewUrl } from '@/shared/lib/preview-url'

const urlByPhotoId = new Map<string, string>()

export async function resolvePhotoObjectUrl(
  photoId: string,
  blob: Blob,
): Promise<string> {
  const cachedUrl = urlByPhotoId.get(photoId)
  if (cachedUrl !== undefined) {
    return cachedUrl
  }

  const url = await createPreviewUrl(blob)
  urlByPhotoId.set(photoId, url)
  return url
}

export function getCachedPhotoObjectUrl(photoId: string): string | undefined {
  return urlByPhotoId.get(photoId)
}

export function clearPhotoObjectUrlCache(): void {
  for (const url of urlByPhotoId.values()) {
    revokePreviewUrl(url)
  }
  urlByPhotoId.clear()
}
