import type { UploadJobStore } from '@/entities/media/api/upload-jobs.store'
import {
  importCursorKey,
  UPLOAD_JOB_STATES,
  uploadJobId,
  type ImportSourceKind,
  type UploadJob,
  type UploadJobState,
} from '@/entities/media/model/upload-job'
import { classifyImportError } from '@/features/media-import/model/import-errors'
import type { ImportCandidate } from '@/features/media-import/model/types'

export type JobPhase =
  | 'done'
  | 'exporting'
  | 'finalizing'
  | 'preparing'
  | 'uploading'

export interface CurrentJob {
  /** 0..1 within the current phase. */
  fraction: number
  jobId: string
  phase: JobPhase
  sourceId: string
}

export type QueueRuntime = 'idle' | 'paused' | 'running' | 'waiting_online'

export interface QueueSnapshot {
  counts: Record<UploadJobState, number>
  current: CurrentJob | null
  /** Jobs in insertion order. */
  jobs: UploadJob[]
  runtime: QueueRuntime
}

export interface JobHooks {
  onPhase: (phase: JobPhase, fraction: number) => void
}

export interface UploadQueueDeps {
  /** Exponential backoff base: delay = base * 2^(attempt - 1). */
  backoffBaseMs?: number
  backoffMaxMs?: number
  /** Injected clock (epoch ms); never read from `Date` inside the logic. */
  clock: () => number
  isOnline: () => boolean
  journeyId: string
  /** One batched query for already imported source ids of the owner. */
  listExisting: (
    ownerId: string,
    sourceIds: readonly string[],
  ) => Promise<Set<string>>
  maxAttempts?: number
  /** Subscribes to the browser coming back online; returns unsubscribe. */
  onOnline: (callback: () => void) => () => void
  ownerId: string
  process: (job: UploadJob, hooks: JobHooks) => Promise<{ mediaId: string }>
  /** Timer seam (fake timers or a manual scheduler in tests). */
  schedule: (callback: () => void, delayMs: number) => () => void
  store: UploadJobStore
}

export interface EnqueueResult {
  /** Candidates that became pending (new or reset from failed). */
  enqueued: number
  /** Candidates already known as jobs, left untouched. */
  known: number
  skipped: number
}

export interface UploadQueue {
  cancel(): Promise<void>
  dispose(): void
  enqueue(
    sourceKind: ImportSourceKind,
    candidates: readonly ImportCandidate[],
  ): Promise<EnqueueResult>
  getSnapshot: () => QueueSnapshot
  init(): Promise<void>
  pause(): Promise<void>
  /** Failed -> pending (attempts reset) and runs. */
  retryFailed(): Promise<void>
  resume(): Promise<void>
  start(): void
  subscribe: (listener: () => void) => () => void
  /** Resolves when the worker loop is not running (tests, page teardown). */
  whenSettled(): Promise<void>
}

const DEFAULT_BACKOFF_BASE_MS = 2_000
const DEFAULT_BACKOFF_MAX_MS = 5 * 60_000
const DEFAULT_MAX_ATTEMPTS = 5

function emptyCounts(): Record<UploadJobState, number> {
  const counts = {} as Record<UploadJobState, number>
  for (const state of UPLOAD_JOB_STATES) counts[state] = 0
  return counts
}

/**
 * Persistent, sequential import queue for one journey and one owner. One job
 * runs at a time, which covers both "photos with concurrency 1" and "videos
 * strictly one at a time". The in-flight job cannot be aborted: pause and
 * cancel take effect after it finishes.
 */
export function createUploadQueue(deps: UploadQueueDeps): UploadQueue {
  const backoffBase = deps.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS
  const backoffMax = deps.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS
  const maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  const jobs = new Map<string, UploadJob>()
  const retryAt = new Map<string, number>()
  const listeners = new Set<() => void>()
  let runtime: QueueRuntime = 'idle'
  let current: CurrentJob | null = null
  let snapshot: QueueSnapshot = {
    counts: emptyCounts(),
    current: null,
    jobs: [],
    runtime: 'idle',
  }
  let looping: Promise<void> | null = null
  let cancelWake: (() => void) | null = null

  const iso = (): string => new Date(deps.clock()).toISOString()

  function emit(): void {
    const counts = emptyCounts()
    const list = [...jobs.values()]
    for (const job of list) counts[job.state] += 1
    snapshot = { counts, current, jobs: list, runtime }
    for (const listener of listeners) listener()
  }

  async function save(changed: readonly UploadJob[]): Promise<void> {
    for (const job of changed) jobs.set(job.id, job)
    await deps.store.putJobs(changed)
    emit()
  }

  function patch(job: UploadJob, change: Partial<UploadJob>): UploadJob {
    return { ...job, ...change, updatedAt: iso() }
  }

  function clearWake(): void {
    cancelWake?.()
    cancelWake = null
  }

  async function advanceCursor(job: UploadJob): Promise<void> {
    if (job.capturedAt === null) return
    const existing = await deps.store.getCursor(job.journeyId, job.sourceKind)
    if (
      existing !== null &&
      Date.parse(existing.lastCapturedAt) >= Date.parse(job.capturedAt)
    ) {
      return
    }
    await deps.store.putCursor({
      journeyId: job.journeyId,
      key: importCursorKey(job.journeyId, job.sourceKind),
      lastCapturedAt: job.capturedAt,
      sourceKind: job.sourceKind,
      updatedAt: iso(),
    })
  }

  async function runJob(job: UploadJob): Promise<void> {
    let working = patch(job, { state: 'processing' })
    current = {
      fraction: 0,
      jobId: job.id,
      phase: 'preparing',
      sourceId: job.sourceId,
    }
    await save([working])
    try {
      const { mediaId } = await deps.process(working, {
        onPhase: (phase, fraction) => {
          current = { fraction, jobId: job.id, phase, sourceId: job.sourceId }
          emit()
        },
      })
      working = patch(working, { mediaId, state: 'done' })
      delete working.lastError
      current = null
      await save([working])
      await advanceCursor(working)
      return
    } catch (error) {
      current = null
      const outcome = classifyImportError(error)
      if (outcome.kind === 'skip') {
        working = patch(working, {
          lastError: outcome.reason,
          state: 'skipped',
        })
      } else if (outcome.kind === 'fail') {
        working = patch(working, { lastError: outcome.reason, state: 'failed' })
      } else if (!deps.isOnline()) {
        // Offline: not the item's fault. Back to pending without an attempt.
        working = patch(working, {
          lastError: outcome.reason,
          state: 'pending',
        })
        runtime = 'waiting_online'
      } else {
        const attempts = working.attempts + 1
        if (attempts >= maxAttempts) {
          working = patch(working, {
            attempts,
            lastError: outcome.reason,
            state: 'failed',
          })
        } else {
          const delay = Math.min(backoffMax, backoffBase * 2 ** (attempts - 1))
          retryAt.set(job.id, deps.clock() + delay)
          working = patch(working, {
            attempts,
            lastError: outcome.reason,
            state: 'pending',
          })
        }
      }
    }
    if (working.state === 'pending' && runtime === 'paused') {
      working = patch(working, { state: 'paused' })
    }
    if (working.state === 'pending' && runtime === 'idle') {
      // Cancelled while in flight: do not leave work behind.
      jobs.delete(working.id)
      await deps.store.deleteJobs([working.id])
      emit()
      return
    }
    await save([working])
  }

  async function loop(): Promise<void> {
    while (runtime === 'running') {
      if (!deps.isOnline()) {
        runtime = 'waiting_online'
        emit()
        return
      }
      const pending = [...jobs.values()].filter((j) => j.state === 'pending')
      if (pending.length === 0) {
        runtime = 'idle'
        emit()
        return
      }
      const now = deps.clock()
      const ready = pending.find((j) => (retryAt.get(j.id) ?? 0) <= now)
      if (ready === undefined) {
        const next = Math.min(...pending.map((j) => retryAt.get(j.id) ?? now))
        clearWake()
        cancelWake = deps.schedule(
          () => {
            cancelWake = null
            kick()
          },
          Math.max(0, next - now),
        )
        return
      }
      retryAt.delete(ready.id)
      await runJob(ready)
    }
  }

  function kick(): void {
    if (looping !== null) return
    const run = loop()
      .catch(() => {
        // A persistence failure must not wedge the queue in 'running'.
        runtime = 'idle'
        current = null
        emit()
      })
      .finally(() => {
        looping = null
      })
    looping = run
  }

  function start(): void {
    clearWake()
    runtime = 'running'
    emit()
    kick()
  }

  let stopOnline: (() => void) | null = null

  return {
    async cancel() {
      clearWake()
      runtime = 'idle'
      const doomed = [...jobs.values()].filter(
        (j) => j.state === 'pending' || j.state === 'paused',
      )
      for (const job of doomed) {
        jobs.delete(job.id)
        retryAt.delete(job.id)
      }
      await deps.store.deleteJobs(doomed.map((j) => j.id))
      emit()
    },
    dispose() {
      clearWake()
      stopOnline?.()
      stopOnline = null
    },
    async enqueue(sourceKind, candidates) {
      const result: EnqueueResult = { enqueued: 0, known: 0, skipped: 0 }
      const changed: UploadJob[] = []
      const fresh: UploadJob[] = []
      const seen = new Set<string>()
      for (const candidate of candidates) {
        const id = uploadJobId(deps.journeyId, sourceKind, candidate.sourceId)
        if (seen.has(id)) continue
        seen.add(id)
        const existing = jobs.get(id)
        if (existing !== undefined) {
          if (existing.state === 'failed') {
            changed.push(patch(existing, { attempts: 0, state: 'pending' }))
            result.enqueued += 1
          } else {
            result.known += 1
          }
          continue
        }
        const now = iso()
        const job: UploadJob = {
          attempts: 0,
          byteSize: candidate.byteSize ?? null,
          capturedAt: candidate.capturedAt,
          createdAt: now,
          durationMs: candidate.durationMs,
          id,
          journeyId: deps.journeyId,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          mediaType: candidate.mediaType,
          ownerId: deps.ownerId,
          sourceId: candidate.sourceId,
          sourceKind,
          state: 'pending',
          updatedAt: now,
        }
        if (candidate.skipReason !== undefined) {
          changed.push({
            ...job,
            lastError: candidate.skipReason,
            state: 'skipped',
          })
          result.skipped += 1
        } else {
          fresh.push(job)
        }
      }

      let existingIds = new Set<string>()
      try {
        existingIds = await deps.listExisting(
          deps.ownerId,
          fresh.map((job) => job.sourceId),
        )
      } catch {
        // Offline or transient: the server's unique index still rejects
        // duplicates and the job is then skipped as `duplicate`.
      }
      for (const job of fresh) {
        if (existingIds.has(job.sourceId)) {
          changed.push({ ...job, lastError: 'duplicate', state: 'skipped' })
          result.skipped += 1
        } else {
          changed.push(job)
          result.enqueued += 1
        }
      }
      if (changed.length > 0) await save(changed)
      return result
    },
    getSnapshot: () => snapshot,
    async init() {
      stopOnline?.()
      stopOnline = deps.onOnline(() => {
        if (runtime === 'waiting_online') {
          runtime = 'running'
          emit()
          kick()
        }
      })
      if (looping !== null) return
      const stored = await deps.store.listJobs(deps.journeyId)
      const recovered: UploadJob[] = []
      for (const job of stored) {
        if (job.ownerId !== deps.ownerId) continue
        // A reload mid-upload leaves 'processing' behind; the server-side
        // cleanup and the unique indexes make re-running it safe.
        if (job.state === 'processing') {
          const back = patch(job, { state: 'pending' })
          recovered.push(back)
          jobs.set(back.id, back)
        } else {
          jobs.set(job.id, job)
        }
      }
      if (recovered.length > 0) await deps.store.putJobs(recovered)
      emit()
    },
    async pause() {
      clearWake()
      runtime = 'paused'
      const pending = [...jobs.values()]
        .filter((j) => j.state === 'pending')
        .map((j) => patch(j, { state: 'paused' }))
      if (pending.length > 0) await save(pending)
      else emit()
    },
    async resume() {
      const paused = [...jobs.values()]
        .filter((j) => j.state === 'paused')
        .map((j) => patch(j, { state: 'pending' }))
      if (paused.length > 0) await save(paused)
      start()
    },
    async retryFailed() {
      const failed = [...jobs.values()]
        .filter((j) => j.state === 'failed')
        .map((j) => patch(j, { attempts: 0, state: 'pending' }))
      if (failed.length > 0) await save(failed)
      start()
    },
    start,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async whenSettled() {
      while (looping !== null) await looping
    },
  }
}

export function browserOnlineEvents(callback: () => void): () => void {
  window.addEventListener('online', callback)
  return () => {
    window.removeEventListener('online', callback)
  }
}

export function timeoutScheduler(
  callback: () => void,
  delayMs: number,
): () => void {
  const handle = setTimeout(callback, delayMs)
  return () => {
    clearTimeout(handle)
  }
}
