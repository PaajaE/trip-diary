import type {
  ImageContentType,
  ImageVariantKind,
} from '@trip-diary/core/media-upload'
import {
  deleteMediaObjectsRemote,
  putToPresignedUrl,
  signVariantPut,
} from '@/entities/media/api/media-upload.api'
import {
  addVariant,
  createMedia,
  deleteMedia,
  markMediaFailed,
  markMediaReady,
} from '@/entities/media/api/media.repository'
import {
  MediaUploadError,
  type NewMediaVariant,
  type NewPhotoMedia,
  type SignPutResponse,
} from '@/entities/media/model/media'
import {
  processPhoto,
  type ProcessedPhoto,
} from '@/entities/photo/lib/process-photo'
import {
  readRawExifTime,
  resolveCaptureTime,
  type CaptureTime,
  type RawExifTime,
} from '@/features/media-upload/lib/capture-time'

export type UploadPhase = 'preparing' | 'uploading' | 'finalizing' | 'done'

export interface UploadProgress {
  completedVariants: number
  phase: UploadPhase
  totalVariants: number
}

export interface UploadPhotoOptions {
  deps?: Partial<UploadPhotoDeps>
  onProgress?: (progress: UploadProgress) => void
  /** auth.uid() of the signed-in user; must match the session. */
  ownerId: string
  sourceAssetId?: string
}

export interface UploadedPhoto {
  mediaId: string
  variants: { kind: ImageVariantKind; publicUrl: string; storageKey: string }[]
}

/** Seams for tests; defaults hit the real repositories and the browser. */
export interface UploadPhotoDeps {
  addVariant: (input: NewMediaVariant) => Promise<void>
  createMedia: (input: NewPhotoMedia) => Promise<void>
  deleteMedia: (mediaId: string) => Promise<void>
  deleteMediaObjects: (mediaId: string) => Promise<number>
  hashFile: (file: File) => Promise<string>
  markMediaFailed: (mediaId: string) => Promise<void>
  markMediaReady: (mediaId: string) => Promise<void>
  newId: () => string
  processPhoto: (file: File) => Promise<ProcessedPhoto>
  put: (
    signed: Pick<SignPutResponse, 'headers' | 'url'>,
    blob: Blob,
  ) => Promise<void>
  readExifTime: (file: File) => Promise<RawExifTime>
  signPut: (input: {
    byteSize: number
    contentType: ImageContentType
    kind: ImageVariantKind
    mediaId: string
  }) => Promise<SignPutResponse>
}

const defaultDeps: UploadPhotoDeps = {
  addVariant,
  createMedia,
  deleteMedia,
  deleteMediaObjects: deleteMediaObjectsRemote,
  hashFile: sha256Hex,
  markMediaFailed,
  markMediaReady,
  newId: () => crypto.randomUUID(),
  processPhoto: (file) => processPhoto(file),
  put: putToPresignedUrl,
  readExifTime: readRawExifTime,
  signPut: signVariantPut,
}

export async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** v1 processing names the biggest variant `full`; v2 calls it `large`. */
export function toV2VariantKind(kind: string): ImageVariantKind | null {
  switch (kind) {
    case 'thumb':
    case 'small':
    case 'medium':
      return kind
    case 'full':
      return 'large'
    default:
      return null
  }
}

/**
 * Uploads one photo: media row (uploading) -> per variant sign + PUT + variant
 * row -> media 'ready'. After the media row exists, any failure marks it
 * 'failed', deletes its R2 folder and, only if that cleanup succeeded, deletes
 * the media row so the same file can be uploaded again (its content_hash is
 * unique per owner). If the R2 cleanup fails the 'failed' row is kept. Cleanup
 * is best effort; the original upload error is always the one rethrown.
 */
export async function uploadPhoto(
  file: File,
  options: UploadPhotoOptions,
): Promise<UploadedPhoto> {
  const deps: UploadPhotoDeps = { ...defaultDeps, ...options.deps }
  const report = (
    phase: UploadPhase,
    completedVariants: number,
    totalVariants: number,
  ): void => {
    options.onProgress?.({ completedVariants, phase, totalVariants })
  }

  report('preparing', 0, 0)
  let processed: ProcessedPhoto
  let contentHash: string
  let captureTime: CaptureTime
  try {
    processed = await deps.processPhoto(file)
    contentHash = await deps.hashFile(file)
    captureTime = resolveCaptureTime(await deps.readExifTime(file), {
      latitude: processed.latitude,
      longitude: processed.longitude,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'HEIC_UNSUPPORTED') {
      throw new MediaUploadError('heic_unsupported', undefined, error)
    }
    throw new MediaUploadError('processing_failed', undefined, error)
  }

  const variants = processed.variants.map((variant) => {
    const kind = toV2VariantKind(variant.kind)
    if (kind === null || variant.mimeType === 'video/mp4') {
      throw new MediaUploadError(
        'processing_failed',
        `unsupported variant ${variant.kind}`,
      )
    }
    return { ...variant, kind, mimeType: variant.mimeType }
  })
  const largest = variants.find((variant) => variant.kind === 'large')
  const total = variants.length

  const mediaId = deps.newId()
  await deps.createMedia({
    capturedAt: captureTime.capturedAt,
    capturedTz: captureTime.capturedTz,
    contentHash,
    height: largest?.height ?? null,
    id: mediaId,
    latitude: processed.latitude,
    longitude: processed.longitude,
    ownerId: options.ownerId,
    width: largest?.width ?? null,
    ...(options.sourceAssetId === undefined
      ? {}
      : { sourceAssetId: options.sourceAssetId }),
  })

  const uploaded: UploadedPhoto['variants'] = []
  try {
    report('uploading', 0, total)
    const prefix = `${options.ownerId.toLowerCase()}/${mediaId}/`
    for (const variant of variants) {
      const signed = await deps.signPut({
        byteSize: variant.blob.size,
        contentType: variant.mimeType,
        kind: variant.kind,
        mediaId,
      })
      if (!signed.key.startsWith(prefix)) {
        throw new MediaUploadError('invalid_response', 'unexpected storage key')
      }
      await deps.put(signed, variant.blob)
      await deps.addVariant({
        byteSize: variant.blob.size,
        height: variant.height,
        kind: variant.kind,
        mediaId,
        mimeType: variant.mimeType,
        storageKey: signed.key,
        width: variant.width,
      })
      uploaded.push({
        kind: variant.kind,
        publicUrl: signed.publicUrl,
        storageKey: signed.key,
      })
      report('uploading', uploaded.length, total)
    }
    report('finalizing', total, total)
    await deps.markMediaReady(mediaId)
  } catch (error) {
    await deps.markMediaFailed(mediaId).catch(() => undefined)
    try {
      await deps.deleteMediaObjects(mediaId)
      await deps.deleteMedia(mediaId)
    } catch {
      // R2 cleanup or row delete failed: keep the 'failed' row for later cleanup.
    }
    throw error instanceof MediaUploadError
      ? error
      : new MediaUploadError('upload_failed', undefined, error)
  }

  report('done', total, total)
  return { mediaId, variants: uploaded }
}
