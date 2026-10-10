// Direct uploads to Cloudflare R2 (docs/plan-v2.md, phase 2).
//
// Pure, dependency-free helpers shared by the media-upload edge function
// (Deno) and its unit tests (@trip-diary/core). Objects are written under the
// signed-in user's folder only: `<userId>/<mediaId>/<kind>.<ext>`.
// Reads go through the public custom domain (decision 2026-10-09: public,
// unguessable URLs; a signing Worker can be added later).

export const IMAGE_MAX_BYTES = 20 * 1024 * 1024
export const VIDEO_MAX_BYTES = 120 * 1024 * 1024
/**
 * v2 video limit (docs/plan-v2.md): 60 s. The client declares the duration;
 * the API enforces it but cannot verify it from the file. A small tolerance
 * absorbs container rounding (e.g. 60.04 s clips).
 */
export const VIDEO_MAX_DURATION_MS = 60_000
export const VIDEO_DURATION_TOLERANCE_MS = 500
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
      durationMs: number
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
  | {
      action: 'delete-media'
      mediaId: string
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
      const { byteSize, durationMs } = body
      if (!isPositiveInteger(byteSize) || byteSize > VIDEO_MAX_BYTES) {
        return { error: 'invalid_size', ok: false }
      }
      if (!isPositiveInteger(durationMs)) {
        return { error: 'invalid_duration', ok: false }
      }
      if (durationMs > VIDEO_MAX_DURATION_MS + VIDEO_DURATION_TOLERANCE_MS) {
        return { error: 'video_too_long', ok: false }
      }
      return { ok: true, value: { action, byteSize, durationMs, mediaId: id } }
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
    case 'delete-media':
      return { ok: true, value: { action, mediaId: id } }
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

/** Folder holding every object of one media item. */
export function mediaPrefix(userId: string, mediaId: string): string {
  if (!UUID.test(userId) || !UUID.test(mediaId)) {
    throw new Error('invalid ids')
  }
  return `${userId.toLowerCase()}/${mediaId.toLowerCase()}/`
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
}

function xmlText(value: string): string {
  return value.replace(
    /&(?:amp|apos|gt|lt|quot);/g,
    (entity) => XML_ENTITIES[entity] ?? entity,
  )
}

/** Reads one ListObjectsV2 page: keys plus the next continuation token. */
export function parseListPage(xml: string): {
  keys: string[]
  nextToken: string | null
} {
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].flatMap((match) =>
    match[1] === undefined ? [] : [xmlText(match[1])],
  )
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(
    xml,
  )?.[1]
  return {
    keys,
    nextToken: truncated && token !== undefined ? xmlText(token) : null,
  }
}

/** The R2 operations needed to delete a media folder (signed fetch). */
export interface ObjectStore {
  fetch(url: string, init?: { method: string }): Promise<Response>
}

/** Raised when a media folder could not be listed or fully deleted. */
export class DeleteMediaError extends Error {}

const LIST_PAGE_LIMIT = 10
const DELETE_CONCURRENCY = 20

/**
 * Deletes every object under `prefix`. Missing objects (404) count as
 * already deleted. Throws DeleteMediaError unless the whole folder is gone,
 * so a truncated listing or a failed delete never reports success.
 * Returns the number of objects actually removed.
 */
export async function deleteMediaObjects(
  store: ObjectStore,
  endpoint: string,
  bucket: string,
  prefix: string,
): Promise<number> {
  const keys: string[] = []
  let token: string | null = null
  for (let page = 0; ; page += 1) {
    if (page >= LIST_PAGE_LIMIT) {
      throw new DeleteMediaError('listing too long')
    }
    const list = new URL(`${endpoint}/${encodeURIComponent(bucket)}`)
    list.searchParams.set('list-type', '2')
    list.searchParams.set('prefix', prefix)
    if (token !== null) {
      list.searchParams.set('continuation-token', token)
    }
    const response = await store.fetch(list.toString())
    if (!response.ok) {
      throw new DeleteMediaError(`list objects ${String(response.status)}`)
    }
    const parsed = parseListPage(await response.text())
    keys.push(...parsed.keys.filter((key) => key.startsWith(prefix)))
    if (parsed.nextToken === null) {
      break
    }
    token = parsed.nextToken
  }

  let removed = 0
  let failed = 0
  for (let start = 0; start < keys.length; start += DELETE_CONCURRENCY) {
    const results = await Promise.allSettled(
      keys.slice(start, start + DELETE_CONCURRENCY).map(async (key) => {
        const response = await store.fetch(objectUrl(endpoint, bucket, key), {
          method: 'DELETE',
        })
        if (!response.ok && response.status !== 404) {
          throw new Error(`delete object ${String(response.status)}`)
        }
        return response.ok
      }),
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        failed += 1
      } else if (result.value) {
        removed += 1
      }
    }
  }
  if (failed > 0) {
    throw new DeleteMediaError(`${String(failed)} objects not deleted`)
  }
  return removed
}
