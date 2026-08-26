import {
  looksLikeMp4Bytes,
  PHOTO_VARIANT_POLICY,
  resolveSmallDimensions,
  resolveThumbDimensions,
  VIDEO_MAX_CANONICAL_BYTES,
  VIDEO_MAX_DURATION_SECONDS,
  VIDEO_POSTER_TIME_MS,
  type PhotoDimensions,
} from '@trip-diary/utils'
import type { PhotoVariantKind } from '@/entities/photo/model/photo'
import type { ProcessedPhoto } from '@/entities/photo/lib/process-photo'
import type { SelectedPhotoFile } from '@/entities/photo/lib/process-photo'

interface ProcessedVideoVariant {
  blob: Blob
  ext: 'jpg' | 'mp4'
  height: number
  kind: PhotoVariantKind
  mimeType: 'image/jpeg' | 'video/mp4'
  width: number
}

export interface ProcessedVideo extends ProcessedPhoto {
  durationMs: number
  mediaType: 'video'
}

function isVideoFile(file: File): boolean {
  const mime = file.type.trim().toLowerCase()
  return mime.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)
}

export function isVideoInput(input: File | SelectedPhotoFile): boolean {
  const file = input instanceof File ? input : input.file
  return isVideoFile(file)
}

export async function processVideo(
  input: File | SelectedPhotoFile,
): Promise<ProcessedVideo> {
  const file = input instanceof File ? input : input.file
  const metadataOverrides = input instanceof File ? undefined : input.metadata

  if (!isVideoFile(file)) {
    throw new Error('UNSUPPORTED_VIDEO_FORMAT')
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (!looksLikeMp4Bytes(header)) {
    throw new Error('UNSUPPORTED_VIDEO_FORMAT')
  }

  const probed = await probeVideoFile(file)
  if (probed.durationMs / 1000 > VIDEO_MAX_DURATION_SECONDS) {
    throw new Error('VIDEO_TOO_LONG')
  }
  if (file.size > VIDEO_MAX_CANONICAL_BYTES) {
    throw new Error('VIDEO_TOO_LARGE')
  }
  if (file.size <= 0) {
    throw new Error('VIDEO_EMPTY')
  }

  const posterTimeMs = Math.min(
    VIDEO_POSTER_TIME_MS,
    Math.max(0, probed.durationMs - 100),
  )
  const posterFrame = await extractPosterFrame(file, posterTimeMs)
  const thumbPlan = resolveThumbDimensions(posterFrame)
  const smallPlan = resolveSmallDimensions(posterFrame)

  const thumbBlob = await canvasToJpeg(
    posterFrame.canvas,
    thumbPlan.width,
    thumbPlan.height,
    PHOTO_VARIANT_POLICY.thumb.jpegQuality,
  )
  const smallBlob = await canvasToJpeg(
    posterFrame.canvas,
    smallPlan.width,
    smallPlan.height,
    PHOTO_VARIANT_POLICY.small.jpegQuality,
  )

  const variants: ProcessedVideoVariant[] = [
    {
      blob: file,
      ext: 'mp4',
      height: probed.height,
      kind: 'video',
      mimeType: 'video/mp4',
      width: probed.width,
    },
    {
      blob: thumbBlob,
      ext: 'jpg',
      height: thumbPlan.height,
      kind: 'thumb',
      mimeType: 'image/jpeg',
      width: thumbPlan.width,
    },
    {
      blob: smallBlob,
      ext: 'jpg',
      height: smallPlan.height,
      kind: 'small',
      mimeType: 'image/jpeg',
      width: smallPlan.width,
    },
  ]

  return {
    capturedAt: metadataOverrides?.capturedAt ?? null,
    durationMs: probed.durationMs,
    latitude: metadataOverrides?.latitude ?? null,
    longitude: metadataOverrides?.longitude ?? null,
    mediaType: 'video',
    variants,
  }
}

async function probeVideoFile(file: File): Promise<{
  durationMs: number
  height: number
  width: number
}> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        resolve()
      }
      video.onerror = () => {
        reject(new Error('VIDEO_DECODE_FAILED'))
      }
      video.src = url
    })

    const durationMs =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration * 1000)
        : VIDEO_MAX_DURATION_SECONDS * 1000

    return {
      durationMs,
      height: Math.max(1, video.videoHeight),
      width: Math.max(1, video.videoWidth),
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function extractPosterFrame(
  file: File,
  timeMs: number,
): Promise<{ canvas: HTMLCanvasElement; height: number; width: number }> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.src = url

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => {
        resolve()
      }
      video.onerror = () => {
        reject(new Error('VIDEO_POSTER_FAILED'))
      }
    })

    video.currentTime = Math.max(0, timeMs / 1000)
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => {
        resolve()
      }
      video.onerror = () => {
        reject(new Error('VIDEO_POSTER_FAILED'))
      }
    })

    const width = Math.max(1, video.videoWidth)
    const height = Math.max(1, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('VIDEO_POSTER_FAILED')
    }
    context.drawImage(video, 0, 0, width, height)
    return { canvas, height, width }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToJpeg(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('VIDEO_POSTER_FAILED')
  }
  context.drawImage(source, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
  if (blob === null || blob.size <= 0) {
    throw new Error('VIDEO_POSTER_FAILED')
  }
  return blob
}

export type { PhotoDimensions }
