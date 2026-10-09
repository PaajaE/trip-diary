// Direct uploads to Cloudflare R2 (docs/plan-v2.md, phase 2).
//
// Pure, dependency-free helpers shared by the media-upload edge function
// (Deno) and its unit tests (@trip-diary/core). Objects are written under the
// signed-in user's folder only: `<userId>/<mediaId>/<kind>.<ext>`.
// Reads go through the public custom domain (decision 2026-10-09: public,
// unguessable URLs; a signing Worker can be added later).

export const IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const VIDEO_MAX_BYTES = 120 * 1024 * 1024
/** R2/S3 minimum for every part but the last is 5 MiB. */
export const MULTIPART_PART_BYTES = 8 * 1024 * 1024
export const PUT_URL_TTL_SECONDS = 15 * 60
export const PART_URL_TTL_SECONDS = 60 * 60

export const IMAGE_VARIANT_KINDS = [
  'thumb',
  'small',
  'medium',
  'large',
  'poster',
] as const
export type ImageVariantKind = (typeof IMAGE_VARIANT_KINDS)[number]
export type UploadKind = ImageVariantKind | 'video'

export type ImageContentType = 'image/webp' | 'image/jpeg'
export type UploadContentType = ImageContentType | 'video/mp4'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type UploadRequest =
  | {
      action: 'sign-put'
      byteSize: number
      contentType: ImageContentType
      kind: ImageVariantKind
      mediaId: string
    }
  | {
      action: 'multipart-create'
      byteSize: number
      mediaId: string
    }
  | {
      action: 'multipart-sign-parts'
      mediaId: string
      partNumbers: number[]
      uploadId: string
    }
  | {
      action: 'multipart-complete'
      mediaId: string
      parts: { etag: string; partNumber: number }[]
      uploadId: string
    }
  | {
      action: 'multipart-abort'
      mediaId: string
      uploadId: string
    }

export type ParseResult<T> =
  | { ok: true; value: T }
  | { error: string; ok: false }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isUploadId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    /^[A-Za-z0-9._~+/=-]+$/.test(value)
  )
}

/** Number of parts for a multipart upload of `byteSize` bytes. */
export function partCount(
  byteSize: number,
  partBytes = MULTIPART_PART_BYTES,
): number {
  return Math.max(1, Math.ceil(byteSize / partBytes))
}

/** Validates an untrusted request body; never throws. */
export function parseUploadRequest(body: unknown): ParseResult<UploadRequest> {
  if (!isRecord(body)) {
    return { error: 'invalid_body', ok: false }
  }
  const { action, mediaId } = body
  if (typeof mediaId !== 'string' || !UUID.test(mediaId)) {
    return { error: 'invalid_media_id', ok: false }
  }
  const id = mediaId.toLowerCase()

  switch (action) {
    case 'sign-put': {
      const { byteSize, contentType, kind } = body
      if (
        typeof kind !== 'string' ||
        !(IMAGE_VARIANT_KINDS as readonly string[]).includes(kind)
      ) {
        return { error: 'invalid_kind', ok: false }
      }
      if (contentType !== 'image/webp' && contentType !== 'image/jpeg') {
        return { error: 'invalid_content_type', ok: false }
      }
      if (!isPositiveInteger(byteSize) || byteSize > IMAGE_MAX_BYTES) {
        return { error: 'invalid_size', ok: false }
      }
      return {
        ok: true,
        value: {
          action,
          byteSize,
          contentType,
          kind: kind as ImageVariantKind,
          mediaId: id,
        },
      }
    }
    case 'multipart-create': {
      const { byteSize } = body
      if (!isPositiveInteger(byteSize) || byteSize > VIDEO_MAX_BYTES) {
        return { error: 'invalid_size', ok: false }
      }
      return { ok: true, value: { action, byteSize, mediaId: id } }
    }
    case 'multipart-sign-parts': {
      const { partNumbers, uploadId } = body
      const maxPart = partCount(VIDEO_MAX_BYTES)
      if (!isUploadId(uploadId)) {
        return { error: 'invalid_upload_id', ok: false }
      }
      if (
        !Array.isArray(partNumbers) ||
        partNumbers.length === 0 ||
        partNumbers.length > maxPart ||
        !partNumbers.every((part) => isPositiveInteger(part) && part <= maxPart)
      ) {
        return { error: 'invalid_parts', ok: false }
      }
      return {
        ok: true,
        value: {
          action,
          mediaId: id,
          partNumbers: [...new Set(partNumbers as number[])].sort(
            (a, b) => a - b,
          ),
          uploadId,
        },
      }
    }
    case 'multipart-complete': {
      const { parts, uploadId } = body
      if (!isUploadId(uploadId)) {
        return { error: 'invalid_upload_id', ok: false }
      }
      if (
        !Array.isArray(parts) ||
        parts.length === 0 ||
        parts.length > partCount(VIDEO_MAX_BYTES) ||
        !parts.every(
          (part) =>
            isRecord(part) &&
            isPositiveInteger(part.partNumber) &&
            typeof part.etag === 'string' &&
            /^"?[A-Za-z0-9-]{1,100}"?$/.test(part.etag),
        )
      ) {
        return { error: 'invalid_parts', ok: false }
      }
      const normalized = (parts as { etag: string; partNumber: number }[])
        .map((part) => ({ etag: part.etag, partNumber: part.partNumber }))
        .sort((a, b) => a.partNumber - b.partNumber)
      return {
        ok: true,
        value: { action, mediaId: id, parts: normalized, uploadId },
      }
    }
    case 'multipart-abort': {
      const { uploadId } = body
      if (!isUploadId(uploadId)) {
        return { error: 'invalid_upload_id', ok: false }
      }
      return { ok: true, value: { action, mediaId: id, uploadId } }
    }
    default:
      return { error: 'invalid_action', ok: false }
  }
}

export function extensionFor(contentType: UploadContentType): string {
  switch (contentType) {
    case 'image/webp':
      return 'webp'
    case 'image/jpeg':
      return 'jpg'
    case 'video/mp4':
      return 'mp4'
  }
}

/** Object key inside the bucket; always under the caller's own folder. */
export function objectKey(
  userId: string,
  mediaId: string,
  kind: UploadKind,
  contentType: UploadContentType,
): string {
  if (!UUID.test(userId) || !UUID.test(mediaId)) {
    throw new Error('invalid ids')
  }
  if ((kind === 'video') !== (contentType === 'video/mp4')) {
    throw new Error('kind and content type do not match')
  }
  return `${userId.toLowerCase()}/${mediaId.toLowerCase()}/${kind}.${extensionFor(contentType)}`
}

export function r2Endpoint(accountId: string): string {
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    throw new Error('invalid R2 account id')
  }
  return `https://${accountId.toLowerCase()}.r2.cloudflarestorage.com`
}

export function objectUrl(
  endpoint: string,
  bucket: string,
  key: string,
): string {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return `${endpoint}/${encodeURIComponent(bucket)}/${path}`
}

export function publicUrl(publicBase: string, key: string): string {
  return `${publicBase.replace(/\/+$/, '')}/${key}`
}

/** Reads UploadId from a CreateMultipartUpload XML response. */
export function parseUploadIdXml(xml: string): string | null {
  const match = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)
  return match?.[1] ?? null
}

/** Body for CompleteMultipartUpload. */
export function completeMultipartXml(
  parts: readonly { etag: string; partNumber: number }[],
): string {
  const items = parts
    .map((part) => {
      const etag = part.etag.startsWith('"') ? part.etag : `"${part.etag}"`
      return `<Part><PartNumber>${String(part.partNumber)}</PartNumber><ETag>${etag}</ETag></Part>`
    })
    .join('')
  return `<CompleteMultipartUpload>${items}</CompleteMultipartUpload>`
}
