import {
  VIDEO_DURATION_TOLERANCE_MS,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_DURATION_MS,
} from '@trip-diary/core/media-upload'
import { MediaUploadError } from '@/entities/media/model/media'
import {
  uploadVideo,
  type UploadedVideo,
  type UploadVideoDeps,
  type UploadVideoOptions,
} from '@/features/media-upload/api/upload-video'
import type {
  ExportedVideo,
  UploadedPart,
  UploadProgress as NativeUploadProgress,
  UploadPartsOptions,
} from '@/shared/lib/video-pipeline'

/** Longest edge of the poster frame, in pixels. */
export const WEB_POSTER_MAX_EDGE = 1280
const POSTER_QUALITY = 0.8
const PROBE_TIMEOUT_MS = 20_000

export interface WebVideoProbe {
  durationMs: number
  height: number
  poster: Blob
  posterHeight: number
  posterWidth: number
  width: number
}

/** Browser seams (DOM, fetch, object URLs); replaced by fakes in tests. */
export interface WebVideoDeps {
  createObjectUrl: (blob: Blob) => string
  fetchPart: (
    url: string,
    body: Blob,
    signal: AbortSignal,
  ) => Promise<{ etag: string | null; ok: boolean; status: number }>
  probe: (file: File) => Promise<WebVideoProbe>
  revokeObjectUrl: (url: string) => void
}

export type UploadWebVideoOptions = Omit<UploadVideoOptions, 'deps'>

/** Test seams: pipeline deps and browser deps. */
export interface UploadWebVideoOverrides {
  deps?: Partial<UploadVideoDeps>
  web?: Partial<WebVideoDeps>
}

function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { height: number; width: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

function waitFor(
  target: HTMLVideoElement,
  event: 'loadedmetadata' | 'seeked',
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new MediaUploadError('processing_failed', 'video probe timed out'))
    }, timeoutMs)
    const onDone = (): void => {
      cleanup()
      resolve()
    }
    const onError = (): void => {
      cleanup()
      reject(new MediaUploadError('processing_failed', 'video cannot be read'))
    }
    function cleanup(): void {
      clearTimeout(timer)
      target.removeEventListener(event, onDone)
      target.removeEventListener('error', onError)
    }
    target.addEventListener(event, onDone)
    target.addEventListener('error', onError)
  })
}

/**
 * Reads duration, size and a poster frame with an off-DOM <video>. The object
 * URL is always revoked. Size and duration limits are checked by the caller.
 */
export async function probeVideoInBrowser(file: File): Promise<WebVideoProbe> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  try {
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    const loaded = waitFor(video, 'loadedmetadata', PROBE_TIMEOUT_MS)
    video.src = url
    await loaded
    const duration = video.duration
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      throw new MediaUploadError('processing_failed', 'video has no metadata')
    }
    const durationMs = Math.round(duration * 1000)
    const width = video.videoWidth
    const height = video.videoHeight

    const seeked = waitFor(video, 'seeked', PROBE_TIMEOUT_MS)
    video.currentTime = Math.min(1, duration / 2)
    await seeked

    const size = fitWithin(width, height, WEB_POSTER_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new MediaUploadError('processing_failed', 'no canvas context')
    }
    context.drawImage(video, 0, 0, size.width, size.height)
    const poster = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', POSTER_QUALITY)
    })
    if (poster === null) {
      throw new MediaUploadError('processing_failed', 'poster encoding failed')
    }
    return {
      durationMs,
      height,
      poster,
      posterHeight: size.height,
      posterWidth: size.width,
      width,
    }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/**
 * PUTs one part. The ETag response header is required for the multipart
 * complete call. Browsers expose it only if the R2 bucket CORS rule lists
 * `ExposeHeaders: ["ETag"]`; without it `etag` is null and the upload fails.
 */
async function fetchPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
): Promise<{ etag: string | null; ok: boolean; status: number }> {
  const response = await fetch(url, { body, method: 'PUT', signal })
  return {
    etag: response.headers.get('ETag'),
    ok: response.ok,
    status: response.status,
  }
}

const defaultWebDeps: WebVideoDeps = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  fetchPart,
  probe: probeVideoInBrowser,
  revokeObjectUrl: (url) => {
    URL.revokeObjectURL(url)
  },
}

/** Server limits (same constants as the media-upload edge function). */
export function assertWebVideoLimits(file: File, durationMs: number): void {
  if (file.type !== 'video/mp4') {
    throw new MediaUploadError(
      'processing_failed',
      'only video/mp4 is accepted',
    )
  }
  if (file.size <= 0 || file.size > VIDEO_MAX_BYTES) {
    throw new MediaUploadError('video_too_large')
  }
  if (durationMs > VIDEO_MAX_DURATION_MS + VIDEO_DURATION_TOLERANCE_MS) {
    throw new MediaUploadError('video_too_long')
  }
}

/**
 * Uploads a video picked in the browser through the same pipeline as iOS
 * (uploadVideo) by swapping the native seams: "export" = probe the File,
 * parts = sequential PUTs of file.slice(), poster = a canvas frame. The capture
 * time is left to the caller (mp4 has no EXIF in the browser).
 */
export function uploadWebVideo(
  file: File,
  options: UploadWebVideoOptions,
  overrides: UploadWebVideoOverrides = {},
): Promise<UploadedVideo> {
  const web: WebVideoDeps = { ...defaultWebDeps, ...overrides.web }
  const controller = new AbortController()
  const listeners = new Set<(progress: NativeUploadProgress) => void>()
  const urls: string[] = []
  let poster: Blob | null = null

  const deps: Partial<UploadVideoDeps> = {
    cancelUpload: () => {
      controller.abort()
      return Promise.resolve()
    },
    deleteExportedFiles: (fileUrls) => {
      for (const url of fileUrls) web.revokeObjectUrl(url)
      urls.length = 0
      return Promise.resolve()
    },
    exportVideo: async (): Promise<ExportedVideo> => {
      assertWebVideoLimits(file, 0)
      const probed = await web.probe(file)
      assertWebVideoLimits(file, probed.durationMs)
      poster = probed.poster
      const fileUrl = web.createObjectUrl(file)
      urls.push(fileUrl)
      const posterUrl = web.createObjectUrl(probed.poster)
      urls.push(posterUrl)
      return {
        byteSize: file.size,
        durationMs: probed.durationMs,
        fileUrl,
        height: probed.height,
        mimeType: 'video/mp4',
        posterByteSize: probed.poster.size,
        posterHeight: probed.posterHeight,
        posterUrl,
        posterWidth: probed.posterWidth,
        width: probed.width,
      }
    },
    readFile: () => {
      if (poster === null) {
        return Promise.reject(
          new MediaUploadError('processing_failed', 'poster is missing'),
        )
      }
      return Promise.resolve(poster)
    },
    subscribeExportProgress: () => Promise.resolve(() => Promise.resolve()),
    subscribeUploadProgress: (listener) => {
      listeners.add(listener)
      return Promise.resolve(() => {
        listeners.delete(listener)
        return Promise.resolve()
      })
    },
    uploadParts: async (parts: UploadPartsOptions): Promise<UploadedPart[]> => {
      const done: UploadedPart[] = []
      let bytesSent = 0
      for (const part of parts.parts) {
        if (controller.signal.aborted) {
          throw new MediaUploadError('upload_failed', 'upload cancelled')
        }
        const result = await web.fetchPart(
          part.url,
          file.slice(part.offset, part.offset + part.length),
          controller.signal,
        )
        if (!result.ok) {
          throw new MediaUploadError(
            'upload_failed',
            `part ${String(part.partNumber)} failed with ${String(result.status)}`,
          )
        }
        if (result.etag === null || result.etag === '') {
          throw new MediaUploadError(
            'upload_failed',
            'ETag header is not readable: the R2 bucket CORS rule must list ExposeHeaders: ETag',
          )
        }
        done.push({ etag: result.etag, partNumber: part.partNumber })
        bytesSent += part.length
        for (const listener of listeners) {
          listener({
            bytesSent,
            completedParts: done.length,
            totalParts: parts.parts.length,
            uploadKey: parts.uploadKey,
          })
        }
      }
      return done
    },
    ...overrides.deps,
  }

  return uploadVideo({ ...options, deps })
}
