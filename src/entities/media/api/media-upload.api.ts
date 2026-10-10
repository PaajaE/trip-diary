import type {
  ImageContentType,
  ImageVariantKind,
} from '@trip-diary/core/media-upload'
import {
  deleteMediaResponseSchema,
  MediaUploadError,
  signPutResponseSchema,
  type SignPutResponse,
} from '@/entities/media/model/media'
import { getSupabaseClient } from '@/shared/api/supabase'

/** Asks the media-upload edge function for a presigned PUT URL. */
export async function signVariantPut(input: {
  byteSize: number
  contentType: ImageContentType
  kind: ImageVariantKind
  mediaId: string
}): Promise<SignPutResponse> {
  const result = await getSupabaseClient().functions.invoke('media-upload', {
    body: { action: 'sign-put', ...input },
  })
  if (result.error !== null) {
    throw new MediaUploadError('sign_failed', undefined, result.error)
  }
  const parsed = signPutResponseSchema.safeParse(result.data)
  if (!parsed.success) {
    throw new MediaUploadError('invalid_response', 'sign-put response invalid')
  }
  return parsed.data
}

/** Deletes every R2 object of a media item (cleanup after a failure). */
export async function deleteMediaObjectsRemote(
  mediaId: string,
): Promise<number> {
  const result = await getSupabaseClient().functions.invoke('media-upload', {
    body: { action: 'delete-media', mediaId },
  })
  if (result.error !== null) {
    throw new MediaUploadError('delete_failed', undefined, result.error)
  }
  const parsed = deleteMediaResponseSchema.safeParse(result.data)
  if (!parsed.success) {
    throw new MediaUploadError(
      'invalid_response',
      'delete-media response invalid',
    )
  }
  return parsed.data.deleted
}

/** PUTs a blob to a presigned URL with the headers the function returned. */
export async function putToPresignedUrl(
  signed: Pick<SignPutResponse, 'headers' | 'url'>,
  blob: Blob,
): Promise<void> {
  const response = await fetch(signed.url, {
    body: blob,
    headers: signed.headers,
    method: 'PUT',
  })
  if (!response.ok) {
    throw new MediaUploadError(
      'upload_failed',
      `PUT failed with ${String(response.status)}`,
    )
  }
}
