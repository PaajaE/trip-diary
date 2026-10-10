import {
  MediaUploadError,
  type MediaUploadErrorCode,
} from '@/entities/media/model/media'
import { MediaLibraryError } from '@/shared/lib/media-library'

const SKIPPED_UPLOAD_CODES: ReadonlySet<MediaUploadErrorCode> = new Set([
  'duplicate',
  'heic_unsupported',
  'video_too_large',
  'video_too_long',
])

/** What the queue does with a failed job. */
export type ImportOutcome =
  /** Permanent, not an error of ours: state `skipped`, never retried. */
  | { kind: 'skip'; reason: string }
  /** Permanent failure: state `failed`, no automatic retry. */
  | { kind: 'fail'; reason: string }
  /** Transient: retried with exponential backoff, up to the attempt limit. */
  | { kind: 'retry'; reason: string }

/** Thrown by the processor for decisions it makes itself. */
export class ImportJobError extends Error {
  readonly outcome: 'fail' | 'skip'
  readonly reason: string

  constructor(outcome: 'fail' | 'skip', reason: string) {
    super(reason)
    this.name = 'ImportJobError'
    this.outcome = outcome
    this.reason = reason
  }
}

export function classifyImportError(error: unknown): ImportOutcome {
  if (error instanceof ImportJobError) {
    return { kind: error.outcome, reason: error.reason }
  }
  if (error instanceof MediaUploadError) {
    if (SKIPPED_UPLOAD_CODES.has(error.code)) {
      return { kind: 'skip', reason: error.code }
    }
    if (error.code === 'processing_failed') {
      return { kind: 'fail', reason: error.code }
    }
    return { kind: 'retry', reason: error.code }
  }
  if (error instanceof MediaLibraryError) {
    if (error.code === 'NOT_FOUND') return { kind: 'skip', reason: 'not_found' }
    if (error.code === 'NOT_AUTHORIZED') {
      return { kind: 'fail', reason: 'not_authorized' }
    }
    if (error.code === 'ASSET_UNAVAILABLE') {
      return { kind: 'fail', reason: 'asset_unavailable' }
    }
    return { kind: 'retry', reason: error.code.toLowerCase() }
  }
  return { kind: 'retry', reason: 'unknown' }
}
