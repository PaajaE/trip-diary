import type { ImportSourceKind } from '@/entities/media/model/upload-job'

export type { ImportSourceKind }

/** Why a candidate is not imported (permanent, never retried). */
export type ImportSkipReason =
  | 'duplicate'
  | 'heic_unsupported'
  | 'no_capture_time'
  | 'not_found'
  | 'unsupported_type'
  | 'video_too_large'
  | 'video_too_long'
  | 'web_video_unsupported'

export interface ImportCandidate {
  byteSize?: number | null
  /** Exact UTC instant (ISO 8601) or null when the source does not know it. */
  capturedAt: string | null
  durationMs: number | null
  latitude: number | null
  longitude: number | null
  mediaType: 'photo' | 'video'
  /** Set when the candidate can never be imported (listed as skipped). */
  skipReason?: ImportSkipReason
  /** PHAsset local id, or for web a stable id (name + size + lastModified). */
  sourceId: string
}

/**
 * Half-open range of instants: from <= capturedAt < to. Either end may be
 * missing. Dates the user picks are converted to instants by `dayRange`.
 */
export interface ImportRange {
  from?: string
  to?: string
}

export interface OpenedPhoto {
  cleanup(): Promise<void>
  file: File
}

export interface MediaSource {
  kind: ImportSourceKind
  /** All importable and skipped candidates in the range (metadata only). */
  list(range?: ImportRange): Promise<ImportCandidate[]>
  /** Photos only. iOS videos go through uploadVideo(assetId). */
  open(candidate: ImportCandidate): Promise<OpenedPhoto>
}
