import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPhotoStoragePath as buildSharedPhotoStoragePath,
  isOversizedThumbVariant,
  type MediaType,
  type PhotoVariantKind,
} from '@trip-diary/utils'
import {
  generateMediumJpeg,
  generateSmallJpeg,
  generateThumbJpeg,
} from '@/platform/media/photo'
import { normalizePhotoCapturedAt } from '@/platform/media/normalize-captured-at'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import {
  PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES,
  VIDEO_MAX_CANONICAL_BYTES,
} from './photo-storage-limits'

export const PHOTO_UPLOAD_OPERATION = 'photo.upload'
export const PHOTOS_STORAGE_BUCKET = 'photos'
/** Canonical master variant (normalized JPEG). */
export const DEFAULT_PHOTO_VARIANT = 'full' as const

export type PhotoVariantType = PhotoVariantKind
export type PhotoMimeType = 'image/jpeg' | 'image/webp' | 'video/mp4'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PhotoUploadPayload {
  byteSize: number
  capturedAt?: string | null
  durationMs?: number | null
  entryId?: string | null
  height: number
  isCover?: boolean
  journeyId: string
  latitude?: number | null
  localUri: string
  longitude?: number | null
  mediaType?: MediaType
  mimeType: PhotoMimeType
  originalFilename: string
  photoId: string
  position?: number
  /** Optional ~800px small file; failure must not fail master upload. */
  smallByteSize?: number | null
  smallHeight?: number | null
  smallLocalUri?: string | null
  smallWidth?: number | null
  /** Optional ~220px thumb file; failure must not fail master upload. */
  thumbByteSize?: number | null
  thumbHeight?: number | null
  thumbLocalUri?: string | null
  thumbWidth?: number | null
  /**
   * Master declare variant. New uploads use `full`. Legacy queued ops may still
   * send `preview`, which is treated as the master file.
   */
  variant?: PhotoVariantType
  width: number
  /** Diagnostics (persisted for failed/retry visibility). */
  attemptCount?: number
  declaredMime?: string | null
  failedStage?: string | null
  sourceUriScheme?: string | null
}

export interface PhotoUploadResult {
  photoId: string
  storagePath: string
  thumbStoragePath: string | null
  thumbUploadError: string | null
}

export class PhotoUploadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly stage: string = 'upload',
  ) {
    super(message)
    this.name = 'PhotoUploadError'
  }
}

export function buildPhotoStoragePath(
  creatorId: string,
  photoId: string,
  variant: PhotoVariantType,
  mimeType: PhotoMimeType,
): string {
  if (variant === 'video' || mimeType === 'video/mp4') {
    return buildSharedPhotoStoragePath(creatorId, photoId, 'video', 'mp4')
  }

  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'webp'
  return buildSharedPhotoStoragePath(creatorId, photoId, variant, extension)
}

export function parsePhotoUploadPayload(
  payload: Record<string, unknown>,
): PhotoUploadPayload {
  const photoId = readUuid(payload.photoId, 'photoId')
  const journeyId = readNonEmptyString(payload.journeyId, 'journeyId')
  const localUri = readNonEmptyString(payload.localUri, 'localUri')
  const originalFilename = readNonEmptyString(
    payload.originalFilename,
    'originalFilename',
  )
  const mimeType = readMimeType(payload.mimeType)
  const mediaType = readMediaType(payload.mediaType, mimeType)
  const durationMs = readOptionalPositiveInteger(payload.durationMs)
  const width = readPositiveInteger(payload.width, 'width')
  const height = readPositiveInteger(payload.height, 'height')
  const byteSize = readPositiveInteger(payload.byteSize, 'byteSize')
  const variant = readVariant(payload.variant)
  const capturedAt = readOptionalString(payload.capturedAt)
  const entryId = readOptionalUuid(payload.entryId)
  const latitude = readOptionalNumber(payload.latitude)
  const longitude = readOptionalNumber(payload.longitude)
  const position = readOptionalNonNegativeInteger(payload.position)
  const isCover =
    typeof payload.isCover === 'boolean' ? payload.isCover : position === 0
  const thumbLocalUri = readOptionalNullableString(payload.thumbLocalUri)
  const thumbByteSize = readOptionalPositiveInteger(payload.thumbByteSize)
  const thumbWidth = readOptionalPositiveInteger(payload.thumbWidth)
  const thumbHeight = readOptionalPositiveInteger(payload.thumbHeight)
  const smallLocalUri = readOptionalNullableString(payload.smallLocalUri)
  const smallByteSize = readOptionalPositiveInteger(payload.smallByteSize)
  const smallWidth = readOptionalPositiveInteger(payload.smallWidth)
  const smallHeight = readOptionalPositiveInteger(payload.smallHeight)

  return {
    attemptCount:
      typeof payload.attemptCount === 'number' ? payload.attemptCount : 1,
    byteSize,
    capturedAt,
    declaredMime: readOptionalNullableString(payload.declaredMime),
    durationMs,
    entryId,
    failedStage: readOptionalNullableString(payload.failedStage),
    height,
    isCover,
    journeyId,
    latitude,
    localUri,
    longitude,
    mediaType,
    mimeType,
    originalFilename,
    photoId,
    position,
    smallByteSize,
    smallHeight,
    smallLocalUri,
    smallWidth,
    sourceUriScheme: readOptionalNullableString(payload.sourceUriScheme),
    thumbByteSize,
    thumbHeight,
    thumbLocalUri,
    thumbWidth,
    variant,
    width,
  }
}

export function assertPhotoFileWithinStorageLimit(
  byteSize: number,
  mediaType: MediaType = 'photo',
): void {
  const limit =
    mediaType === 'video'
      ? VIDEO_MAX_CANONICAL_BYTES
      : PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES

  if (byteSize > limit) {
    throw new PhotoUploadError(
      `${mediaType === 'video' ? 'Video' : 'Photo'} exceeds Storage limit (${String(limit)} bytes): ${String(byteSize)} bytes.`,
      false,
      'validate',
    )
  }
}

type DerivativeKind = 'thumb' | 'small' | 'medium'

export interface PhotoUploadDeps {
  cleanupLocalFiles?: (uris: string[]) => Promise<void>
  generateMedium?: (
    masterUri: string,
    photoId: string,
    width: number,
    height: number,
  ) => Promise<{ height: number; uri: string; width: number }>
  generateSmall?: (
    masterUri: string,
    photoId: string,
    width: number,
    height: number,
  ) => Promise<{ height: number; uri: string; width: number }>
  generateThumb?: (
    masterUri: string,
    photoId: string,
    width: number,
    height: number,
  ) => Promise<{ height: number; uri: string; width: number }>
  getClient: () => SupabaseClient
  getLocalFileByteSize: (localUri: string) => Promise<number>
  localFileExists: (localUri: string) => Promise<boolean>
  readLocalFileBytes: (localUri: string) => Promise<ArrayBuffer>
  verifyRemoteObjectByteSize?: (
    client: SupabaseClient,
    storagePath: string,
  ) => Promise<number>
}

const defaultDeps: PhotoUploadDeps = {
  cleanupLocalFiles: async (uris: string[]) => {
    for (const uri of uris) {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true })
      } catch {
        // Best-effort after confirmed remote persistence.
      }
    }
  },
  generateMedium: generateMediumJpeg,
  generateSmall: generateSmallJpeg,
  generateThumb: generateThumbJpeg,
  getClient: getSupabaseClient,
  getLocalFileByteSize: async (localUri: string) => {
    const info = await FileSystem.getInfoAsync(localUri, { size: true })
    if (!info.exists) {
      throw new PhotoUploadError(
        `Local photo file is missing or empty: ${localUri}`,
        false,
        'validate',
      )
    }

    if (!('size' in info) || info.size <= 0) {
      throw new PhotoUploadError(
        `Local photo file is missing or empty: ${localUri}`,
        false,
        'validate',
      )
    }

    return info.size
  },
  localFileExists: async (localUri: string) => {
    const info = await FileSystem.getInfoAsync(localUri)
    return info.exists
  },
  readLocalFileBytes: async (localUri: string) => {
    // React Native: Blob/File/FormData uploads to Supabase Storage often land as
    // 0-byte objects. Always upload an ArrayBuffer decoded from base64.
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    if (base64.length === 0) {
      throw new PhotoUploadError(
        `Local photo file is missing or empty: ${localUri}`,
        false,
        'validate',
      )
    }

    const buffer = decode(base64)
    if (buffer.byteLength === 0) {
      throw new PhotoUploadError(
        `Local photo file decoded to zero bytes: ${localUri}`,
        false,
        'validate',
      )
    }

    return buffer
  },
  verifyRemoteObjectByteSize: verifyRemoteObjectByteSize,
}

export async function processPhotoUploadOperation(
  payload: Record<string, unknown>,
  deps: PhotoUploadDeps = defaultDeps,
): Promise<PhotoUploadResult> {
  if (!isSupabaseConfigured()) {
    throw new PhotoUploadError('Supabase is not configured.', true, 'auth')
  }

  let parsed: PhotoUploadPayload
  try {
    parsed = parsePhotoUploadPayload(payload)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Malformed photo upload payload.'
    throw new PhotoUploadError(message, false, 'validate')
  }

  const client = deps.getClient()
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError !== null) {
    throw new PhotoUploadError(sessionError.message, true, 'auth')
  }

  if (session === null) {
    throw new PhotoUploadError(
      'Authentication required before photo upload.',
      true,
      'auth',
    )
  }

  const creatorId = session.user.id
  const isVideo = parsed.mediaType === 'video'

  const enqueuedByUserId = readOptionalNullableString(payload.enqueuedByUserId)
  if (
    enqueuedByUserId !== null &&
    enqueuedByUserId.length > 0 &&
    enqueuedByUserId !== creatorId
  ) {
    throw new PhotoUploadError(
      'Queued photo belongs to a different signed-in account.',
      false,
      'auth',
    )
  }

  // Master is `full` for photos and `video` for clips. Legacy payload variant
  // `preview` still identifies the master local file, never a derivative.
  const masterVariant: PhotoVariantType = isVideo ? 'video' : 'full'
  const masterStoragePath = buildPhotoStoragePath(
    creatorId,
    parsed.photoId,
    masterVariant,
    parsed.mimeType,
  )

  const exists = await deps.localFileExists(parsed.localUri)
  if (!exists) {
    throw new PhotoUploadError(
      `Local photo file is missing: ${parsed.localUri}`,
      false,
      'validate',
    )
  }

  const fileByteSize = await deps.getLocalFileByteSize(parsed.localUri)
  assertPhotoFileWithinStorageLimit(fileByteSize, parsed.mediaType ?? 'photo')

  const fileBytes = await deps.readLocalFileBytes(parsed.localUri)
  if (fileBytes.byteLength === 0) {
    throw new PhotoUploadError(
      `Local ${isVideo ? 'video' : 'photo'} file decoded to zero bytes: ${parsed.localUri}`,
      false,
      'validate',
    )
  }

  const uploadByteSize = fileBytes.byteLength
  assertPhotoFileWithinStorageLimit(uploadByteSize, parsed.mediaType ?? 'photo')

  // Photo row may exist without variants — safe for retries.
  await ensurePhotoRow(client, parsed, creatorId)

  // Storage first — never declare a variant before bytes exist remotely.
  await uploadPhotoBytes(client, masterStoragePath, fileBytes, parsed.mimeType)

  const verify = deps.verifyRemoteObjectByteSize ?? verifyRemoteObjectByteSize
  const remoteSize = await verify(client, masterStoragePath)
  if (remoteSize <= 0) {
    throw new PhotoUploadError(
      `Remote Storage object is empty after upload: ${masterStoragePath}`,
      true,
      'storage',
    )
  }

  await declarePhotoVariant(
    client,
    {
      ...parsed,
      byteSize: remoteSize,
      height: parsed.height,
      width: parsed.width,
    },
    creatorId,
    masterStoragePath,
    masterVariant,
  )

  if (parsed.entryId !== null && parsed.entryId !== undefined) {
    await linkPhotoToEntry(client, {
      creatorId,
      entryId: parsed.entryId,
      isCover: parsed.isCover === true || (parsed.position ?? 0) === 0,
      photoId: parsed.photoId,
      position: parsed.position ?? 0,
    })
  }

  const localFiles = resolveDerivativeLocalFiles(parsed)
  const generatedUris: string[] = []
  let thumbStoragePath: string | null = null
  let thumbUploadError: string | null = null

  const derivativeKinds: DerivativeKind[] = isVideo
    ? ['small', 'thumb']
    : ['small', 'medium', 'thumb']

  for (const kind of derivativeKinds) {
    try {
      const uploaded = await uploadDerivativeVariant({
        client,
        creatorId,
        deps,
        generatedUris,
        kind,
        localFiles,
        parsed,
      })
      if (kind === 'thumb') {
        thumbStoragePath = uploaded
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `${kind} variant upload failed.`
      console.warn(`[photo-upload] ${kind} failed; master remains valid`, {
        photoId: parsed.photoId,
        uploadError: message,
      })
      if (kind === 'thumb') {
        thumbUploadError = message
      }
    }
  }

  const cleanup = deps.cleanupLocalFiles
  if (cleanup !== undefined) {
    const toDelete = [parsed.localUri, ...generatedUris]
    for (const uri of [
      localFiles.smallUri,
      localFiles.thumbUri,
      parsed.smallLocalUri,
      parsed.thumbLocalUri,
    ]) {
      if (uri !== null && uri !== undefined && uri.length > 0) {
        toDelete.push(uri)
      }
    }
    await cleanup([...new Set(toDelete)])
  }

  return {
    photoId: parsed.photoId,
    storagePath: masterStoragePath,
    thumbStoragePath,
    thumbUploadError,
  }
}

function resolveDerivativeLocalFiles(parsed: PhotoUploadPayload): {
  smallHeight: number | null
  smallUri: string | null
  smallWidth: number | null
  thumbHeight: number | null
  thumbUri: string | null
  thumbWidth: number | null
} {
  let smallUri = readNonEmptyOptional(parsed.smallLocalUri)
  let smallWidth = parsed.smallWidth ?? null
  let smallHeight = parsed.smallHeight ?? null
  let thumbUri = readNonEmptyOptional(parsed.thumbLocalUri)
  let thumbWidth = parsed.thumbWidth ?? null
  let thumbHeight = parsed.thumbHeight ?? null

  // Legacy queues stored the ~800px derivative as thumbLocalUri. Prefer that as
  // small and force a true ~220 thumb to be generated.
  if (smallUri === null && thumbUri !== null) {
    const legacyAsSmall =
      thumbWidth === null ||
      thumbHeight === null ||
      isOversizedThumbVariant(thumbWidth, thumbHeight)
    if (legacyAsSmall) {
      smallUri = thumbUri
      smallWidth = thumbWidth
      smallHeight = thumbHeight
      thumbUri = null
      thumbWidth = null
      thumbHeight = null
    }
  }

  return {
    smallHeight,
    smallUri,
    smallWidth,
    thumbHeight,
    thumbUri,
    thumbWidth,
  }
}

function readNonEmptyOptional(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null
  }
  return value
}

async function uploadDerivativeVariant(input: {
  client: SupabaseClient
  creatorId: string
  deps: PhotoUploadDeps
  generatedUris: string[]
  kind: DerivativeKind
  localFiles: ReturnType<typeof resolveDerivativeLocalFiles>
  parsed: PhotoUploadPayload
}): Promise<string | null> {
  const { client, creatorId, deps, generatedUris, kind, localFiles, parsed } =
    input

  let localUri: string | null = null
  let width: number | null = null
  let height: number | null = null

  if (kind === 'small') {
    localUri = localFiles.smallUri
    width = localFiles.smallWidth
    height = localFiles.smallHeight
  } else if (kind === 'thumb') {
    localUri = localFiles.thumbUri
    width = localFiles.thumbWidth
    height = localFiles.thumbHeight
  }

  if (localUri === null) {
    const generate =
      kind === 'small'
        ? deps.generateSmall
        : kind === 'medium'
          ? deps.generateMedium
          : deps.generateThumb
    if (generate === undefined) {
      return null
    }
    const generated = await generate(
      parsed.localUri,
      parsed.photoId,
      parsed.width,
      parsed.height,
    )
    localUri = generated.uri
    width = generated.width
    height = generated.height
    generatedUris.push(generated.uri)
  }

  if (!(await deps.localFileExists(localUri))) {
    return null
  }

  const bytes = await deps.readLocalFileBytes(localUri)
  if (bytes.byteLength === 0) {
    throw new PhotoUploadError(
      `${kind} variant decoded to zero bytes.`,
      false,
      kind,
    )
  }

  assertPhotoFileWithinStorageLimit(
    bytes.byteLength,
    parsed.mediaType ?? 'photo',
  )

  const storagePath = buildPhotoStoragePath(
    creatorId,
    parsed.photoId,
    kind,
    'image/jpeg',
  )

  await uploadPhotoBytes(client, storagePath, bytes, 'image/jpeg')

  const verify = deps.verifyRemoteObjectByteSize ?? verifyRemoteObjectByteSize
  const remoteSize = await verify(client, storagePath)
  if (remoteSize <= 0) {
    throw new PhotoUploadError(
      `Remote ${kind} Storage object is empty: ${storagePath}`,
      true,
      kind,
    )
  }

  await declarePhotoVariant(
    client,
    {
      ...parsed,
      byteSize: remoteSize,
      height: height ?? fallbackDerivativeDim(parsed.height, kind),
      mimeType: 'image/jpeg',
      width: width ?? fallbackDerivativeDim(parsed.width, kind),
    },
    creatorId,
    storagePath,
    kind,
  )

  return storagePath
}

function fallbackDerivativeDim(
  masterDim: number,
  kind: DerivativeKind,
): number {
  const divisor = kind === 'thumb' ? 12 : kind === 'small' ? 3 : 2
  return Math.max(1, Math.round(masterDim / divisor))
}

export async function verifyRemoteObjectByteSize(
  client: SupabaseClient,
  storagePath: string,
): Promise<number> {
  const slash = storagePath.lastIndexOf('/')
  if (slash <= 0) {
    throw new PhotoUploadError(
      `Invalid storage path for verification: ${storagePath}`,
      false,
      'storage',
    )
  }

  const folder = storagePath.slice(0, slash)
  const fileName = storagePath.slice(slash + 1)

  const { data, error } = await client.storage
    .from(PHOTOS_STORAGE_BUCKET)
    .list(folder, {
      limit: 100,
      search: fileName,
    })

  if (error !== null) {
    throw classifySupabaseError(error)
  }

  const match = data.find((row) => row.name === fileName)
  if (match === undefined) {
    throw new PhotoUploadError(
      `Uploaded Storage object not found: ${storagePath}`,
      true,
      'storage',
    )
  }

  const metadata = match.metadata as { size?: number } | null | undefined
  const size =
    typeof metadata?.size === 'number'
      ? metadata.size
      : typeof match.metadata === 'object' &&
          match.metadata !== null &&
          'size' in match.metadata &&
          typeof (match.metadata as { size?: unknown }).size === 'number'
        ? (match.metadata as { size: number }).size
        : -1

  // Some Storage list responses omit size; fall back to a ranged download check.
  if (size < 0) {
    const { data: blob, error: downloadError } = await client.storage
      .from(PHOTOS_STORAGE_BUCKET)
      .download(storagePath)

    if (downloadError !== null) {
      throw classifySupabaseError(downloadError)
    }

    return blob.size
  }

  return size
}

async function ensurePhotoRow(
  client: SupabaseClient,
  payload: PhotoUploadPayload,
  creatorId: string,
): Promise<void> {
  const metadata = {
    captured_at: normalizePhotoCapturedAt(payload.capturedAt),
    creator_id: creatorId,
    duration_ms:
      payload.durationMs !== null && payload.durationMs !== undefined
        ? payload.durationMs
        : null,
    id: payload.photoId,
    latitude:
      payload.latitude !== null && payload.latitude !== undefined
        ? payload.latitude
        : null,
    longitude:
      payload.longitude !== null && payload.longitude !== undefined
        ? payload.longitude
        : null,
    media_type: payload.mediaType ?? 'photo',
  }

  const { error: insertError } = await client.from('photos').insert(metadata)
  if (insertError === null) {
    return
  }

  if (!isDuplicateInsertError(insertError)) {
    throw classifySupabaseError(insertError)
  }

  const { error: updateError } = await client
    .from('photos')
    .update({
      captured_at: metadata.captured_at,
      duration_ms: metadata.duration_ms,
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      media_type: metadata.media_type,
    })
    .eq('id', payload.photoId)
    .eq('creator_id', creatorId)

  if (updateError !== null) {
    throw classifySupabaseError(updateError)
  }
}

async function linkPhotoToEntry(
  client: SupabaseClient,
  input: {
    creatorId: string
    entryId: string
    isCover: boolean
    photoId: string
    position: number
  },
): Promise<void> {
  const row = {
    creator_id: input.creatorId,
    entry_id: input.entryId,
    photo_id: input.photoId,
    position: input.position,
  }

  const { error: insertError } = await client.from('entry_photos').insert(row)
  if (insertError !== null && !isDuplicateInsertError(insertError)) {
    throw classifySupabaseError(insertError)
  }

  if (insertError !== null) {
    const { error: updateError } = await client
      .from('entry_photos')
      .update({ position: input.position })
      .eq('entry_id', input.entryId)
      .eq('photo_id', input.photoId)
      .eq('creator_id', input.creatorId)

    if (updateError !== null) {
      throw classifySupabaseError(updateError)
    }
  }

  if (!input.isCover) {
    return
  }

  const { error: coverError } = await client.rpc('set_entry_photo_cover', {
    p_entry_id: input.entryId,
    p_photo_id: input.photoId,
  })

  if (coverError !== null) {
    throw classifySupabaseError(coverError)
  }
}

async function declarePhotoVariant(
  client: SupabaseClient,
  payload: PhotoUploadPayload,
  creatorId: string,
  storagePath: string,
  variant: PhotoVariantType,
): Promise<void> {
  const metadata = {
    byte_size: payload.byteSize,
    creator_id: creatorId,
    height: payload.height,
    mime_type: payload.mimeType,
    photo_id: payload.photoId,
    storage_path: storagePath,
    variant,
    width: payload.width,
  }

  const { error: insertError } = await client
    .from('photo_variants')
    .insert(metadata)

  if (insertError === null) {
    return
  }

  if (!isDuplicateInsertError(insertError)) {
    throw classifySupabaseError(insertError)
  }

  const { error: updateError } = await client
    .from('photo_variants')
    .update({
      byte_size: payload.byteSize,
      height: payload.height,
      mime_type: payload.mimeType,
      storage_path: storagePath,
      width: payload.width,
    })
    .eq('photo_id', payload.photoId)
    .eq('variant', variant)
    .eq('creator_id', creatorId)

  if (updateError !== null) {
    throw classifySupabaseError(updateError)
  }
}

async function uploadPhotoBytes(
  client: SupabaseClient,
  storagePath: string,
  bytes: ArrayBuffer,
  mimeType: PhotoMimeType,
): Promise<void> {
  if (bytes.byteLength === 0) {
    throw new PhotoUploadError(
      'Refusing to upload an empty photo file.',
      false,
      'storage',
    )
  }

  const { error } = await client.storage
    .from(PHOTOS_STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: true,
    })

  if (error !== null) {
    throw classifySupabaseError(error)
  }
}

export function classifySupabaseError(error: {
  code?: string
  message?: string
  status?: number | string
}): PhotoUploadError {
  const message = error.message ?? 'Supabase request failed.'
  const normalized = message.toLowerCase()
  const status =
    typeof error.status === 'number'
      ? error.status
      : Number.parseInt(
          typeof error.status === 'string' ? error.status : '',
          10,
        )
  const code = error.code?.toUpperCase()

  if (isPermanentPostgresCode(code) || isPermanentMessage(normalized)) {
    return new PhotoUploadError(message, false, 'database')
  }

  if (status === 401 || normalized.includes('jwt')) {
    return new PhotoUploadError(message, true, 'auth')
  }

  if (
    status === 403 ||
    normalized.includes('permission') ||
    normalized.includes('row-level security')
  ) {
    return new PhotoUploadError(message, false, 'auth')
  }

  if (
    status === 413 ||
    normalized.includes('payload too large') ||
    normalized.includes('entity too large') ||
    normalized.includes('file size')
  ) {
    return new PhotoUploadError(message, false, 'storage')
  }

  if (
    status >= 500 ||
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('temporarily unavailable')
  ) {
    return new PhotoUploadError(message, true, 'storage')
  }

  if (status >= 400 && status < 500) {
    return new PhotoUploadError(message, false, 'storage')
  }

  return new PhotoUploadError(message, true, 'storage')
}

function isPermanentPostgresCode(code: string | undefined): boolean {
  if (code === undefined) {
    return false
  }

  return (
    code === '22P02' ||
    code === '22007' ||
    code === '22008' ||
    code === '23502' ||
    code === '23503' ||
    code === '23505' ||
    code === '23514' ||
    code === '23P01' ||
    code === 'PGRST102' ||
    code === 'PGRST204'
  )
}

function isPermanentMessage(normalized: string): boolean {
  return (
    normalized.includes('invalid input syntax for type uuid') ||
    normalized.includes('invalid input syntax for type timestamp') ||
    normalized.includes('violates check constraint') ||
    normalized.includes('violates foreign key constraint') ||
    normalized.includes('violates unique constraint') ||
    normalized.includes('invalid uuid')
  )
}

function isDuplicateInsertError(error: { message?: string }): boolean {
  return (error.message ?? '').toLowerCase().includes('duplicate')
}

function readUuid(value: unknown, field: string): string {
  const raw = readNonEmptyString(value, field)
  if (!UUID_PATTERN.test(raw)) {
    throw new Error(`Invalid photo upload payload: ${field}`)
  }

  return raw.toLowerCase()
}

function readNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid photo upload payload: ${field}`)
  }

  return value.trim()
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid photo upload payload: coordinate')
  }

  return value
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid photo upload payload: position')
  }

  return Math.trunc(value)
}

function readOptionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  return Math.trunc(value)
}

function readOptionalUuid(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return readUuid(value, 'entryId')
}

function readOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error('Invalid photo upload payload: capturedAt')
  }

  return value
}

function readOptionalNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid photo upload payload: ${field}`)
  }

  return Math.trunc(value)
}

function readMimeType(value: unknown): PhotoMimeType {
  if (
    value === 'image/jpeg' ||
    value === 'image/webp' ||
    value === 'video/mp4'
  ) {
    return value
  }

  throw new Error('Invalid photo upload payload: mimeType')
}

function readMediaType(value: unknown, mimeType: PhotoMimeType): MediaType {
  if (value === 'photo' || value === 'video') {
    return value
  }

  return mimeType === 'video/mp4' ? 'video' : 'photo'
}

function readVariant(value: unknown): PhotoVariantType | undefined {
  if (value === undefined) {
    return undefined
  }

  if (
    value === 'thumb' ||
    value === 'small' ||
    value === 'medium' ||
    value === 'full' ||
    value === 'preview' ||
    value === 'large' ||
    value === 'video'
  ) {
    return value
  }

  throw new Error('Invalid photo upload payload: variant')
}
