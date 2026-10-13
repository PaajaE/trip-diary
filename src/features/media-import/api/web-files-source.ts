import type {
  ImportCandidate,
  ImportRange,
  MediaSource,
  OpenedPhoto,
} from '@/features/media-import/model/types'
import { applyRange } from '@/features/media-import/model/range'

/** Value for the `accept` attribute of the web file input. */
export const WEB_FILES_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4'

const SUPPORTED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

/** Stable id of a picked file: re-picking the same file gives the same id. */
export function webSourceId(file: File): string {
  return `${file.name}|${String(file.size)}|${String(file.lastModified)}`
}

function isHeic(file: File): boolean {
  return HEIC_TYPES.has(file.type) || /\.(heic|heif)$/i.test(file.name)
}

function toCandidate(file: File): ImportCandidate {
  const base = {
    byteSize: file.size,
    // The capture time is read from EXIF during the upload; file.lastModified
    // is not a capture time and is deliberately not used.
    capturedAt: null,
    durationMs: null,
    latitude: null,
    longitude: null,
    sourceId: webSourceId(file),
  }
  if (isHeic(file)) {
    return { ...base, mediaType: 'photo', skipReason: 'heic_unsupported' }
  }
  if (file.type.startsWith('video/')) {
    // Web videos are a later task.
    return { ...base, mediaType: 'video', skipReason: 'web_video_unsupported' }
  }
  if (SUPPORTED_PHOTO_TYPES.has(file.type)) {
    return { ...base, mediaType: 'photo' }
  }
  return { ...base, mediaType: 'photo', skipReason: 'unsupported_type' }
}

/** Source over files chosen with `<input type=file multiple>`. */
export function createWebFilesSource(files: readonly File[]): MediaSource {
  const byId = new Map<string, File>()
  for (const file of files) byId.set(webSourceId(file), file)
  return {
    kind: 'web-files',
    list(range?: ImportRange) {
      const candidates = [...byId.values()].map(toCandidate)
      return Promise.resolve(applyRange(candidates, range))
    },
    open(candidate): Promise<OpenedPhoto> {
      const file = byId.get(candidate.sourceId)
      if (file === undefined) {
        return Promise.reject(new Error('source_unavailable'))
      }
      return Promise.resolve({ cleanup: () => Promise.resolve(), file })
    },
  }
}
