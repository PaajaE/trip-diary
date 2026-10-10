import { Capacitor } from '@capacitor/core'
import {
  resolveCaptureZone,
  type CaptureZone,
} from '@trip-diary/core/automation'
import {
  abortMultipart,
  completeMultipart,
  createMultipart,
  deleteMediaObjectsRemote,
  putToPresignedUrl,
  signMultipartParts,
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
  type MultipartCompleteResponse,
  type MultipartCreateResponse,
  type MultipartSignPartsResponse,
  type NewMediaVariant,
  type NewPhotoMedia,
  type NewVideoMedia,
  type SignPutResponse,
} from '@/entities/media/model/media'
import type { CaptureTime } from '@/features/media-upload/lib/capture-time'
import {
  cancelVideoUpload,
  deleteExportedFiles,
  exportVideo,
  onVideoExportProgress,
  onVideoUploadProgress,
  uploadVideoParts,
  VideoPipelineError,
  type ExportedVideo,
  type UploadedPart,
  type UploadPartDescriptor,
  type UploadPartsOptions,
  type UploadProgress as NativeUploadProgress,
} from '@/shared/lib/video-pipeline'

export type VideoUploadPhase = 'done' | 'exporting' | 'finalizing' | 'uploading'

export interface VideoUploadProgress {
  bytesSent: number
  /** 0..1 within the current phase (export or upload); 1 when done. */
  fraction: number
  phase: VideoUploadPhase
  totalBytes: number
}

export interface VideoAssetMetadata {
  /** PhotoKit creationDate: an exact UTC instant (ISO 8601). */
  creationDate?: string
  latitude?: number
  longitude?: number
}

export interface UploadVideoOptions {
  assetId: string
  assetMetadata?: VideoAssetMetadata
  deps?: Partial<UploadVideoDeps>
  /** Journey to attach the media to (media.journey_id). */
  journeyId?: string
  onProgress?: (progress: VideoUploadProgress) => void
  /** auth.uid() of the signed-in user; must match the session. */
  ownerId: string
  /** PhotoKit local id; used for dedupe (media.source_asset_id). */
  sourceAssetId?: string
}

export interface UploadedVideo {
  durationMs: number
  mediaId: string
  posterKey: string
  videoKey: string
  videoPublicUrl: string
}

/** Seams for tests; defaults hit the native plugin and the repositories. */
export interface UploadVideoDeps {
  abortMultipart: (input: {
    mediaId: string
    uploadId: string
  }) => Promise<void>
  addVariant: (input: NewMediaVariant) => Promise<void>
  cancelUpload: (uploadKey: string) => Promise<void>
  completeMultipart: (input: {
    mediaId: string
    parts: { etag: string; partNumber: number }[]
    uploadId: string
  }) => Promise<MultipartCompleteResponse>
  createMedia: (input: NewPhotoMedia | NewVideoMedia) => Promise<void>
  createMultipart: (input: {
    byteSize: number
    durationMs: number
    mediaId: string
  }) => Promise<MultipartCreateResponse>
  deleteExportedFiles: (fileUrls: string[]) => Promise<void>
  deleteMedia: (mediaId: string) => Promise<void>
  deleteMediaObjects: (mediaId: string) => Promise<number>
  exportVideo: (assetId: string) => Promise<ExportedVideo>
  markMediaFailed: (mediaId: string) => Promise<void>
  markMediaReady: (mediaId: string) => Promise<void>
  newId: () => string
  put: (
    signed: Pick<SignPutResponse, 'headers' | 'url'>,
    blob: Blob,
  ) => Promise<void>
  readFile: (fileUrl: string) => Promise<Blob>
  signParts: (input: {
    mediaId: string
    partNumbers: number[]
    uploadId: string
  }) => Promise<MultipartSignPartsResponse>
  signPut: (input: {
    byteSize: number
    contentType: 'image/jpeg'
    kind: 'poster'
    mediaId: string
  }) => Promise<SignPutResponse>
  subscribeExportProgress: (
    listener: (fraction: number) => void,
  ) => Promise<() => Promise<void>>
  subscribeUploadProgress: (
    listener: (progress: NativeUploadProgress) => void,
  ) => Promise<() => Promise<void>>
  uploadParts: (options: UploadPartsOptions) => Promise<UploadedPart[]>
}

/** Parts signed per edge function call (the server accepts all at once). */
export const SIGN_BATCH_SIZE = 10

const defaultDeps: UploadVideoDeps = {
  abortMultipart,
  addVariant,
  cancelUpload: cancelVideoUpload,
  completeMultipart,
  createMedia,
  createMultipart,
  deleteExportedFiles,
  deleteMedia,
  deleteMediaObjects: deleteMediaObjectsRemote,
  exportVideo: (assetId) => exportVideo({ assetId }),
  markMediaFailed,
  markMediaReady,
  newId: () => crypto.randomUUID(),
  put: putToPresignedUrl,
  readFile: async (fileUrl) => {
    const response = await fetch(Capacitor.convertFileSrc(fileUrl))
    if (!response.ok) {
      throw new MediaUploadError(
        'processing_failed',
        `reading exported file failed with ${String(response.status)}`,
      )
    }
    return response.blob()
  },
  signParts: signMultipartParts,
  signPut: signVariantPut,
  subscribeExportProgress: onVideoExportProgress,
  subscribeUploadProgress: onVideoUploadProgress,
  uploadParts: uploadVideoParts,
}

/**
 * Capture time of a video. PhotoKit's creationDate is already an exact UTC
 * instant; the zone comes only from GPS (resolveCaptureZone). Without GPS the
 * zone stays null: never the device zone, never `new Date()`.
 */
export function resolveVideoCaptureTime(
  metadata: VideoAssetMetadata | undefined,
): CaptureTime {
  const capturedAt = metadata?.creationDate ?? null
  if (capturedAt === null) return { capturedAt: null, capturedTz: null }
  const zone: CaptureZone | null = resolveCaptureZone({
    capturedAt,
    exifOffsetMinutes: null,
    homeTimeZone: null,
    latitude: metadata?.latitude ?? null,
    longitude: metadata?.longitude ?? null,
  })
  return { capturedAt, capturedTz: zone?.timeZone ?? null }
}

/**
 * Splits `byteSize` into consecutive slices of `partBytes` (the last one is
 * shorter) and joins them with the signed URLs by part number.
 */
export function buildPartDescriptors(
  byteSize: number,
  partBytes: number,
  urls: ReadonlyMap<number, string>,
): UploadPartDescriptor[] {
  const count = Math.max(1, Math.ceil(byteSize / partBytes))
  const parts: UploadPartDescriptor[] = []
  for (let index = 0; index < count; index += 1) {
    const partNumber = index + 1
    const url = urls.get(partNumber)
    if (url === undefined) {
      throw new MediaUploadError(
        'invalid_response',
        `no URL for part ${String(partNumber)}`,
      )
    }
    const offset = index * partBytes
    parts.push({
      length: Math.min(partBytes, byteSize - offset),
      offset,
      partNumber,
      url,
    })
  }
  return parts
}

function mapExportError(error: unknown): MediaUploadError {
  if (error instanceof MediaUploadError) return error
  if (error instanceof VideoPipelineError) {
    if (error.code === 'VIDEO_TOO_LONG') {
      return new MediaUploadError('video_too_long', error.message, error)
    }
    if (error.code === 'VIDEO_TOO_LARGE') {
      return new MediaUploadError('video_too_large', error.message, error)
    }
  }
  return new MediaUploadError('export_failed', undefined, error)
}

/**
 * Uploads one iOS video: native export -> media row (uploading) -> multipart
 * create -> sign parts -> native background upload -> complete -> poster PUT
 * -> variant rows (video, poster) -> media 'ready'. Exported files are always
 * deleted at the end.
 *
 * Dedupe: a SHA-256 of the exported mp4 is not cheaply available in JS, so
 * content_hash stays null and duplicates are caught by the unique
 * (owner_id, source_asset_id) index via `sourceAssetId`.
 *
 * Cleanup rule (same as photos): after the media row exists, any failure
 * cancels the native upload, aborts the multipart upload (best effort), marks
 * the row 'failed', deletes the R2 folder and, only if that succeeded, deletes
 * the row so the asset can be uploaded again. The original error is rethrown.
 */
export async function uploadVideo(
  options: UploadVideoOptions,
): Promise<UploadedVideo> {
  const deps: UploadVideoDeps = { ...defaultDeps, ...options.deps }
  let totalBytes = 0
  const report = (
    phase: VideoUploadPhase,
    bytesSent: number,
    fraction: number,
  ): void => {
    options.onProgress?.({ bytesSent, fraction, phase, totalBytes })
  }
  const noop = (): Promise<void> => Promise.resolve()

  report('exporting', 0, 0)
  const stopExport = await deps
    .subscribeExportProgress((fraction) => {
      report('exporting', 0, fraction)
    })
    .catch(() => noop)
  let exported: ExportedVideo
  try {
    exported = await deps.exportVideo(options.assetId)
  } catch (error) {
    throw mapExportError(error)
  } finally {
    await stopExport().catch(() => undefined)
  }

  totalBytes = exported.byteSize
  try {
    if (exported.durationMs <= 0) {
      throw new MediaUploadError('export_failed', 'exported duration is zero')
    }
    return await uploadExported(options, deps, exported, report)
  } finally {
    await deps
      .deleteExportedFiles([exported.fileUrl, exported.posterUrl])
      .catch(() => undefined)
  }
}

async function uploadExported(
  options: UploadVideoOptions,
  deps: UploadVideoDeps,
  exported: ExportedVideo,
  report: (
    phase: VideoUploadPhase,
    bytesSent: number,
    fraction: number,
  ) => void,
): Promise<UploadedVideo> {
  const captureTime = resolveVideoCaptureTime(options.assetMetadata)
  const mediaId = deps.newId()
  await deps.createMedia({
    capturedAt: captureTime.capturedAt,
    capturedTz: captureTime.capturedTz,
    contentHash: null,
    durationMs: exported.durationMs,
    height: exported.height,
    id: mediaId,
    ...(options.journeyId === undefined
      ? {}
      : { journeyId: options.journeyId }),
    kind: 'video',
    latitude: options.assetMetadata?.latitude ?? null,
    longitude: options.assetMetadata?.longitude ?? null,
    ownerId: options.ownerId,
    width: exported.width,
    ...(options.sourceAssetId === undefined
      ? {}
      : { sourceAssetId: options.sourceAssetId }),
  })

  let uploadId: string | null = null
  let stopUpload: () => Promise<void> = () => Promise.resolve()
  try {
    const prefix = `${options.ownerId.toLowerCase()}/${mediaId}/`
    const created = await deps.createMultipart({
      byteSize: exported.byteSize,
      durationMs: exported.durationMs,
      mediaId,
    })
    uploadId = created.uploadId
    if (!created.key.startsWith(prefix)) {
      throw new MediaUploadError('invalid_response', 'unexpected storage key')
    }
    const count = Math.max(1, Math.ceil(exported.byteSize / created.partBytes))
    if (count !== created.partCount) {
      throw new MediaUploadError('invalid_response', 'part count mismatch')
    }

    const urls = new Map<number, string>()
    for (let first = 1; first <= count; first += SIGN_BATCH_SIZE) {
      const partNumbers = Array.from(
        { length: Math.min(SIGN_BATCH_SIZE, count - first + 1) },
        (_, index) => first + index,
      )
      const signed = await deps.signParts({ mediaId, partNumbers, uploadId })
      for (const part of signed.parts) urls.set(part.partNumber, part.url)
    }
    const descriptors = buildPartDescriptors(
      exported.byteSize,
      created.partBytes,
      urls,
    )

    report('uploading', 0, 0)
    stopUpload = await deps
      .subscribeUploadProgress((progress) => {
        if (progress.uploadKey !== mediaId) return
        report(
          'uploading',
          progress.bytesSent,
          Math.min(1, progress.bytesSent / exported.byteSize),
        )
      })
      .catch(() => (): Promise<void> => Promise.resolve())
    const etags = await deps.uploadParts({
      fileUrl: exported.fileUrl,
      parts: descriptors,
      uploadKey: mediaId,
    })
    await stopUpload()
    stopUpload = () => Promise.resolve()

    report('finalizing', exported.byteSize, 1)
    const completed = await deps.completeMultipart({
      mediaId,
      parts: etags.map(({ etag, partNumber }) => ({ etag, partNumber })),
      uploadId,
    })
    if (completed.key !== created.key) {
      throw new MediaUploadError('invalid_response', 'unexpected video key')
    }

    const poster = await deps.readFile(exported.posterUrl)
    const posterSigned = await deps.signPut({
      byteSize: poster.size,
      contentType: 'image/jpeg',
      kind: 'poster',
      mediaId,
    })
    if (!posterSigned.key.startsWith(prefix)) {
      throw new MediaUploadError('invalid_response', 'unexpected storage key')
    }
    await deps.put(posterSigned, poster)

    await deps.addVariant({
      byteSize: exported.byteSize,
      height: exported.height,
      kind: 'video',
      mediaId,
      mimeType: 'video/mp4',
      storageKey: completed.key,
      width: exported.width,
    })
    await deps.addVariant({
      byteSize: poster.size,
      height: exported.posterHeight,
      kind: 'poster',
      mediaId,
      mimeType: 'image/jpeg',
      storageKey: posterSigned.key,
      width: exported.posterWidth,
    })
    await deps.markMediaReady(mediaId)

    report('done', exported.byteSize, 1)
    return {
      durationMs: exported.durationMs,
      mediaId,
      posterKey: posterSigned.key,
      videoKey: completed.key,
      videoPublicUrl: completed.publicUrl,
    }
  } catch (error) {
    await stopUpload().catch(() => undefined)
    await deps.cancelUpload(mediaId).catch(() => undefined)
    if (uploadId !== null) {
      await deps.abortMultipart({ mediaId, uploadId }).catch(() => undefined)
    }
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
}
