import * as FileSystem from 'expo-file-system'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhotoCapturedAt } from '@/platform/media/normalize-captured-at'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'
import { PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES } from './photo-storage-limits'

export const PHOTO_UPLOAD_OPERATION = 'photo.upload'
export const PHOTOS_STORAGE_BUCKET = 'photos'
export const DEFAULT_PHOTO_VARIANT = 'preview' as const

export type PhotoVariantType = 'thumb' | 'preview' | 'large'
export type PhotoMimeType = 'image/jpeg' | 'image/webp'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface PhotoUploadPayload {
  byteSize: number
  capturedAt?: string | null
  entryId?: string | null
  height: number
  isCover?: boolean
  journeyId: string
  latitude?: number | null
  localUri: string
  longitude?: number | null
  mimeType: PhotoMimeType
  originalFilename: string
  photoId: string
  position?: number
  variant?: PhotoVariantType
  width: number
}

export interface PhotoUploadResult {
  photoId: string
  storagePath: string
}

export class PhotoUploadError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
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
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'webp'
  return `${creatorId}/${photoId}/${variant}.${extension}`
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

  return {
    byteSize,
    capturedAt,
    entryId,
    height,
    isCover,
    journeyId,
    latitude,
    localUri,
    longitude,
    mimeType,
    originalFilename,
    photoId,
    position,
    variant,
    width,
  }
}

export function assertPhotoFileWithinStorageLimit(byteSize: number): void {
  if (byteSize > PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES) {
    throw new PhotoUploadError(
      `Photo exceeds Storage limit (${String(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES)} bytes): ${String(byteSize)} bytes.`,
      false,
    )
  }
}

export interface PhotoUploadDeps {
  fetchLocalFile: (localUri: string, mimeType: PhotoMimeType) => Promise<Blob>
  getClient: () => SupabaseClient
  getLocalFileByteSize: (localUri: string) => Promise<number>
  localFileExists: (localUri: string) => Promise<boolean>
}

const defaultDeps: PhotoUploadDeps = {
  fetchLocalFile: async (localUri: string, mimeType: PhotoMimeType) => {
    try {
      const response = await fetch(localUri)
      if (response.ok) {
        const blob = await response.blob()
        if (blob.size > 0) {
          return blob
        }
      }
    } catch {
      // Fall back to FileSystem below — fetch(file://) is unreliable on iOS.
    }

    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    })

    if (base64.length === 0) {
      throw new PhotoUploadError(
        `Local photo file is missing or empty: ${localUri}`,
        false,
      )
    }

    const binary = globalThis.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    return new Blob([bytes], { type: mimeType })
  },
  getClient: getSupabaseClient,
  getLocalFileByteSize: async (localUri: string) => {
    const info = await FileSystem.getInfoAsync(localUri, { size: true })
    if (!info.exists) {
      throw new PhotoUploadError(
        `Local photo file is missing or empty: ${localUri}`,
        false,
      )
    }

    if (!('size' in info) || info.size <= 0) {
      throw new PhotoUploadError(
        `Local photo file is missing or empty: ${localUri}`,
        false,
      )
    }

    return info.size
  },
  localFileExists: async (localUri: string) => {
    const info = await FileSystem.getInfoAsync(localUri)
    return info.exists
  },
}

export async function processPhotoUploadOperation(
  payload: Record<string, unknown>,
  deps: PhotoUploadDeps = defaultDeps,
): Promise<PhotoUploadResult> {
  if (!isSupabaseConfigured()) {
    throw new PhotoUploadError('Supabase is not configured.', true)
  }

  let parsed: PhotoUploadPayload
  try {
    parsed = parsePhotoUploadPayload(payload)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Malformed photo upload payload.'
    throw new PhotoUploadError(message, false)
  }

  const client = deps.getClient()
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError !== null) {
    throw new PhotoUploadError(sessionError.message, true)
  }

  if (session === null) {
    throw new PhotoUploadError(
      'Authentication required before photo upload.',
      true,
    )
  }

  const creatorId = session.user.id

  const enqueuedByUserId = readOptionalString(payload.enqueuedByUserId)
  if (
    enqueuedByUserId !== null &&
    enqueuedByUserId.length > 0 &&
    enqueuedByUserId !== creatorId
  ) {
    throw new PhotoUploadError(
      'Queued photo belongs to a different signed-in account.',
      false,
    )
  }

  const variant = parsed.variant ?? DEFAULT_PHOTO_VARIANT
  const storagePath = buildPhotoStoragePath(
    creatorId,
    parsed.photoId,
    variant,
    parsed.mimeType,
  )

  const exists = await deps.localFileExists(parsed.localUri)
  if (!exists) {
    throw new PhotoUploadError(
      `Local photo file is missing: ${parsed.localUri}`,
      false,
    )
  }

  const fileByteSize = await deps.getLocalFileByteSize(parsed.localUri)
  assertPhotoFileWithinStorageLimit(fileByteSize)

  await ensurePhotoRow(client, parsed, creatorId)
  await declarePhotoVariant(client, parsed, creatorId, storagePath, variant)

  const blob = await deps.fetchLocalFile(parsed.localUri, parsed.mimeType)
  await uploadPhotoBlob(client, storagePath, blob, parsed.mimeType)

  if (parsed.entryId !== null && parsed.entryId !== undefined) {
    await linkPhotoToEntry(client, {
      creatorId,
      entryId: parsed.entryId,
      isCover: parsed.isCover === true || (parsed.position ?? 0) === 0,
      photoId: parsed.photoId,
      position: parsed.position ?? 0,
    })
  }

  return {
    photoId: parsed.photoId,
    storagePath,
  }
}

async function ensurePhotoRow(
  client: SupabaseClient,
  payload: PhotoUploadPayload,
  creatorId: string,
): Promise<void> {
  // Insert-only for new rows. On conflict, update only metadata columns —
  // authenticated clients must not UPDATE photos.id / photos.creator_id
  // (those privileges are revoked; a full upsert fails with
  // "permission denied for table photos").
  const metadata = {
    captured_at: normalizePhotoCapturedAt(payload.capturedAt),
    creator_id: creatorId,
    id: payload.photoId,
    latitude:
      payload.latitude !== null && payload.latitude !== undefined
        ? payload.latitude
        : null,
    longitude:
      payload.longitude !== null && payload.longitude !== undefined
        ? payload.longitude
        : null,
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
      latitude: metadata.latitude,
      longitude: metadata.longitude,
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
  const { error } = await client.from('entry_photos').upsert(
    {
      creator_id: input.creatorId,
      entry_id: input.entryId,
      photo_id: input.photoId,
      position: input.position,
    },
    { onConflict: 'entry_id,photo_id' },
  )

  if (error !== null) {
    throw classifySupabaseError(error)
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
      width: payload.width,
    })
    .eq('photo_id', payload.photoId)
    .eq('variant', variant)
    .eq('creator_id', creatorId)

  if (updateError !== null) {
    throw classifySupabaseError(updateError)
  }
}

async function uploadPhotoBlob(
  client: SupabaseClient,
  storagePath: string,
  blob: Blob,
  mimeType: PhotoMimeType,
): Promise<void> {
  const { error } = await client.storage
    .from(PHOTOS_STORAGE_BUCKET)
    .upload(storagePath, blob, {
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
    return new PhotoUploadError(message, false)
  }

  if (status === 401 || normalized.includes('jwt')) {
    return new PhotoUploadError(message, true)
  }

  if (
    status === 403 ||
    normalized.includes('permission') ||
    normalized.includes('row-level security')
  ) {
    return new PhotoUploadError(message, false)
  }

  if (
    status === 413 ||
    normalized.includes('payload too large') ||
    normalized.includes('entity too large') ||
    normalized.includes('file size')
  ) {
    return new PhotoUploadError(message, false)
  }

  if (
    status >= 500 ||
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('temporarily unavailable')
  ) {
    return new PhotoUploadError(message, true)
  }

  if (status >= 400 && status < 500) {
    return new PhotoUploadError(message, false)
  }

  return new PhotoUploadError(message, true)
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

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid photo upload payload: ${field}`)
  }

  return Math.trunc(value)
}

function readMimeType(value: unknown): PhotoMimeType {
  if (value === 'image/jpeg' || value === 'image/webp') {
    return value
  }

  throw new Error('Invalid photo upload payload: mimeType')
}

function readVariant(value: unknown): PhotoVariantType | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === 'thumb' || value === 'preview' || value === 'large') {
    return value
  }

  throw new Error('Invalid photo upload payload: variant')
}
