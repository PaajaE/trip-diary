import {
  cancelVideoUpload,
  isVideoPipelineAvailable,
  resumeVideoUploads,
  type PendingUpload,
} from '@/shared/lib/video-pipeline'

export interface ReconcileVideoUploadsDeps {
  cancel: (uploadKey: string) => Promise<void>
  isAvailable: () => boolean
  resume: () => Promise<PendingUpload[]>
}

export interface ReconcileVideoUploadsResult {
  /** Failed native uploads that were cancelled (their state discarded). */
  cancelled: number
  /** Uploads the native side reports as finished; see the note below. */
  completed: number
  running: number
}

const defaultDeps: ReconcileVideoUploadsDeps = {
  cancel: cancelVideoUpload,
  isAvailable: isVideoPipelineAvailable,
  resume: resumeVideoUploads,
}

/**
 * Reconciles native background uploads left from a previous app run. Safest
 * minimum, by design:
 *
 * - `failed`: cancelled, so the plugin drops its persisted state.
 * - `running`: left alone; URLSession keeps going in the background.
 * - `completed`: left alone, NOT finished here. Completing needs the S3
 *   uploadId, the object key, the poster and the video dimensions, and the
 *   plugin persists only uploadKey (= mediaId), part ETags and byte counts.
 *   The JS orchestration (uploadVideo) that held the rest died with the app,
 *   so the media row stays 'uploading' until server-side cleanup.
 *
 * Never throws and logs nothing (keys are media ids, but nothing is printed).
 * No-op where the native plugin is unavailable (web, Android).
 */
export async function reconcileVideoUploads(
  overrides: Partial<ReconcileVideoUploadsDeps> = {},
): Promise<ReconcileVideoUploadsResult> {
  const deps = { ...defaultDeps, ...overrides }
  const result: ReconcileVideoUploadsResult = {
    cancelled: 0,
    completed: 0,
    running: 0,
  }
  if (!deps.isAvailable()) return result
  let pending: PendingUpload[]
  try {
    pending = await deps.resume()
  } catch {
    return result
  }
  for (const upload of pending) {
    if (upload.status === 'running') {
      result.running += 1
    } else if (upload.status === 'completed') {
      result.completed += 1
    } else {
      try {
        await deps.cancel(upload.uploadKey)
        result.cancelled += 1
      } catch {
        // Best effort: the next start tries again.
      }
    }
  }
  return result
}

let started = false

/** Runs `reconcileVideoUploads` at most once per app session. */
export function reconcileVideoUploadsOnce(
  overrides: Partial<ReconcileVideoUploadsDeps> = {},
): Promise<ReconcileVideoUploadsResult> | null {
  if (started) return null
  started = true
  return reconcileVideoUploads(overrides)
}

/** Test helper. */
export function resetReconcileVideoUploadsForTests(): void {
  started = false
}
