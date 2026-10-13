import { z } from 'zod'
import type {
  ImageContentType,
  ImageVariantKind,
} from '@trip-diary/core/media-upload'
import {
  deleteMediaResponseSchema,
  MediaUploadError,
  multipartCompleteResponseSchema,
  multipartCreateResponseSchema,
  multipartSignPartsResponseSchema,
  signPutResponseSchema,
  type MultipartCompleteResponse,
  type MultipartCreateResponse,
  type MultipartSignPartsResponse,
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

/** Reads the `error` string of a failed function response, if any. */
async function readFunctionError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return null
  try {
    const body: unknown = await context.clone().json()
    const parsed = z.object({ error: z.string() }).safeParse(body)
    return parsed.success ? parsed.data.error : null
  } catch {
    return null
  }
}

async function invokeMultipart<T>(
  body: Record<string, unknown>,
  schema: z.ZodType<T>,
  failure: 'sign_failed' | 'upload_failed',
): Promise<T> {
  const result = await getSupabaseClient().functions.invoke('media-upload', {
    body,
  })
  if (result.error !== null) {
    const code = await readFunctionError(result.error)
    if (code === 'video_too_long') {
      throw new MediaUploadError('video_too_long', undefined, result.error)
    }
    throw new MediaUploadError(failure, code ?? undefined, result.error)
  }
  const parsed = schema.safeParse(result.data)
  if (!parsed.success) {
    throw new MediaUploadError(
      'invalid_response',
      `${String(body.action)} response invalid`,
    )
  }
  return parsed.data
}

/** Starts an S3 multipart upload for a video (server enforces duration/size). */
export function createMultipart(input: {
  byteSize: number
  durationMs: number
  mediaId: string
}): Promise<MultipartCreateResponse> {
  return invokeMultipart(
    { action: 'multipart-create', ...input },
    multipartCreateResponseSchema,
    'sign_failed',
  )
}

export function signMultipartParts(input: {
  mediaId: string
  partNumbers: number[]
  uploadId: string
}): Promise<MultipartSignPartsResponse> {
  return invokeMultipart(
    { action: 'multipart-sign-parts', ...input },
    multipartSignPartsResponseSchema,
    'sign_failed',
  )
}

export function completeMultipart(input: {
  mediaId: string
  parts: { etag: string; partNumber: number }[]
  uploadId: string
}): Promise<MultipartCompleteResponse> {
  return invokeMultipart(
    { action: 'multipart-complete', ...input },
    multipartCompleteResponseSchema,
    'upload_failed',
  )
}

export async function abortMultipart(input: {
  mediaId: string
  uploadId: string
}): Promise<void> {
  const result = await getSupabaseClient().functions.invoke('media-upload', {
    body: { action: 'multipart-abort', ...input },
  })
  if (result.error !== null) {
    throw new MediaUploadError('delete_failed', undefined, result.error)
  }
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
