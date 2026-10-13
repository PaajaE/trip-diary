import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { z } from 'zod'

/**
 * Native video export (H.264 1080p max, mp4) and background multipart upload.
 * Implemented in ios/App/App/VideoPlugin.swift; unavailable on web.
 * Orchestration and server calls live elsewhere; this is only the wrapper.
 */

export const exportedVideoSchema = z.object({
  byteSize: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
  fileUrl: z.string().min(1),
  height: z.number().int().positive(),
  mimeType: z.literal('video/mp4'),
  posterByteSize: z.number().int().positive(),
  posterHeight: z.number().int().positive(),
  posterUrl: z.string().min(1),
  posterWidth: z.number().int().positive(),
  width: z.number().int().positive(),
})

const uploadedPartSchema = z.object({
  etag: z.string().min(1),
  partNumber: z.number().int().positive(),
})

const uploadPartsResultSchema = z.object({
  parts: z.array(uploadedPartSchema).min(1),
})

export const pendingUploadSchema = z.object({
  bytesSent: z.number().int().nonnegative(),
  completedParts: z.number().int().nonnegative(),
  parts: z.array(uploadedPartSchema),
  status: z.enum(['running', 'completed', 'failed']),
  totalParts: z.number().int().positive(),
  uploadKey: z.string().min(1),
})

const resumeUploadsResultSchema = z.object({
  uploads: z.array(pendingUploadSchema),
})

const exportProgressSchema = z.object({ progress: z.number().min(0).max(1) })

const uploadProgressSchema = z.object({
  bytesSent: z.number().int().nonnegative(),
  completedParts: z.number().int().nonnegative(),
  totalParts: z.number().int().positive(),
  uploadKey: z.string().min(1),
})

export type ExportedVideo = z.infer<typeof exportedVideoSchema>
export type UploadedPart = z.infer<typeof uploadedPartSchema>
export type PendingUpload = z.infer<typeof pendingUploadSchema>
export type UploadProgress = z.infer<typeof uploadProgressSchema>

export type ExportVideoSource = { assetId: string } | { fileUrl: string }

export interface UploadPartDescriptor {
  /** Byte length of the slice. */
  length: number
  /** Byte offset of the slice in the source file. */
  offset: number
  partNumber: number
  /** Presigned PUT URL. */
  url: string
}

export interface UploadPartsOptions {
  fileUrl: string
  parts: UploadPartDescriptor[]
  /** Stable key (for example the mediaId); re-calling with it re-attaches. */
  uploadKey: string
}

interface VideoPipelinePlugin {
  addListener(
    eventName: 'exportProgress' | 'uploadProgress',
    listener: (event: unknown) => void,
  ): Promise<PluginListenerHandle>
  cancelUpload(options: { uploadKey: string }): Promise<void>
  deleteExport(options: { fileUrls: string[] }): Promise<void>
  exportVideo(options: { assetId?: string; fileUrl?: string }): Promise<unknown>
  resumeUploads(): Promise<unknown>
  uploadParts(options: UploadPartsOptions): Promise<unknown>
}

const VideoPipeline = registerPlugin<VideoPipelinePlugin>('VideoPipeline')

export type VideoPipelineErrorCode =
  | 'INVALID_ARGUMENT'
  | 'NOT_AUTHORIZED'
  | 'NOT_FOUND'
  | 'UPLOAD_CANCELLED'
  | 'UPLOAD_FAILED'
  | 'VIDEO_TOO_LARGE'
  | 'VIDEO_TOO_LONG'
  | 'EXPORT_FAILED'
  | 'ASSET_UNAVAILABLE'
  | 'UNKNOWN'

const KNOWN_CODES: readonly VideoPipelineErrorCode[] = [
  'INVALID_ARGUMENT',
  'NOT_AUTHORIZED',
  'NOT_FOUND',
  'UPLOAD_CANCELLED',
  'UPLOAD_FAILED',
  'VIDEO_TOO_LARGE',
  'VIDEO_TOO_LONG',
  'EXPORT_FAILED',
  'ASSET_UNAVAILABLE',
]

export class VideoPipelineError extends Error {
  readonly code: VideoPipelineErrorCode

  constructor(code: VideoPipelineErrorCode, message: string) {
    super(message)
    this.name = 'VideoPipelineError'
    this.code = code
  }
}

export function isVideoPipelineAvailable(): boolean {
  return (
    Capacitor.getPlatform() === 'ios' &&
    Capacitor.isPluginAvailable('VideoPipeline')
  )
}

/** Maps a rejection from the native plugin to a typed error. */
export function toVideoPipelineError(error: unknown): VideoPipelineError {
  if (error instanceof VideoPipelineError) return error
  const parsed = z
    .object({ code: z.string().optional(), message: z.string().optional() })
    .safeParse(error)
  const code = parsed.success ? parsed.data.code : undefined
  const message = parsed.success
    ? (parsed.data.message ?? 'Video pipeline error')
    : 'Video pipeline error'
  const known = KNOWN_CODES.find((candidate) => candidate === code)
  return new VideoPipelineError(known ?? 'UNKNOWN', message)
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw toVideoPipelineError(error)
  }
}

export function exportVideo(source: ExportVideoSource): Promise<ExportedVideo> {
  return call(async () =>
    exportedVideoSchema.parse(await VideoPipeline.exportVideo(source)),
  )
}

/** Removes files produced by `exportVideo` (native side ignores other paths). */
export function deleteExportedFiles(fileUrls: string[]): Promise<void> {
  return call(() => VideoPipeline.deleteExport({ fileUrls }))
}

/** Resolves with every part's ETag once all parts are uploaded. */
export function uploadVideoParts(
  options: UploadPartsOptions,
): Promise<UploadedPart[]> {
  return call(async () => {
    const result = uploadPartsResultSchema.parse(
      await VideoPipeline.uploadParts(options),
    )
    return result.parts
  })
}

export function resumeVideoUploads(): Promise<PendingUpload[]> {
  return call(
    async () =>
      resumeUploadsResultSchema.parse(await VideoPipeline.resumeUploads())
        .uploads,
  )
}

export function cancelVideoUpload(uploadKey: string): Promise<void> {
  return call(() => VideoPipeline.cancelUpload({ uploadKey }))
}

/** Returns an unsubscribe function. Malformed events are dropped. */
export async function onVideoExportProgress(
  listener: (progress: number) => void,
): Promise<() => Promise<void>> {
  const handle = await VideoPipeline.addListener('exportProgress', (event) => {
    const parsed = exportProgressSchema.safeParse(event)
    if (parsed.success) listener(parsed.data.progress)
  })
  return () => handle.remove()
}

export async function onVideoUploadProgress(
  listener: (progress: UploadProgress) => void,
): Promise<() => Promise<void>> {
  const handle = await VideoPipeline.addListener('uploadProgress', (event) => {
    const parsed = uploadProgressSchema.safeParse(event)
    if (parsed.success) listener(parsed.data)
  })
  return () => handle.remove()
}
