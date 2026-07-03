import {
  createPreviewUrl,
  revokePreviewUrl,
} from '@/shared/lib/preview-url'

const urlByPhotoId = new Map<string, string>()
const blobRefByPhotoId = new Map<string, Blob>()

export async function resolvePhotoObjectUrl(
  photoId: string,
  blob: Blob,
): Promise<string> {
  const cachedUrl = urlByPhotoId.get(photoId)
  const cachedBlob = blobRefByPhotoId.get(photoId)

  if (cachedUrl !== undefined && cachedBlob === blob) {
    return cachedUrl
  }

  if (cachedUrl !== undefined) {
    revokePreviewUrl(cachedUrl)
    urlByPhotoId.delete(photoId)
    blobRefByPhotoId.delete(photoId)
  }

  const url = await createPreviewUrl(blob)
  urlByPhotoId.set(photoId, url)
  blobRefByPhotoId.set(photoId, blob)
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
  blobRefByPhotoId.clear()
}
