import type {
  QueueSnapshot,
  UploadQueue,
} from '@/features/media-import/api/upload-queue'
import {
  UPLOAD_JOB_STATES,
  uploadJobId,
  type UploadJob,
  type UploadJobState,
} from '@/entities/media/model/upload-job'
import { DEMO_JOURNEY, DEMO_OWNER } from '@/pages/dev/import-triage/demo-data'

/** A queue whose snapshot is fixed by the harness; actions are no-ops. */
export function createFakeQueue(initial: QueueSnapshot): UploadQueue {
  let snapshot = initial
  const listeners = new Set<() => void>()
  const noop = (): Promise<void> => Promise.resolve()
  return {
    cancel: noop,
    dispose: () => undefined,
    enqueue: () => Promise.resolve({ enqueued: 0, known: 0, skipped: 0 }),
    getSnapshot: () => snapshot,
    init: noop,
    pause() {
      snapshot = { ...snapshot, runtime: 'paused' }
      for (const listener of listeners) listener()
      return Promise.resolve()
    },
    resume() {
      snapshot = { ...snapshot, runtime: 'running' }
      for (const listener of listeners) listener()
      return Promise.resolve()
    },
    retryFailed: noop,
    start: () => undefined,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    whenSettled: noop,
  }
}

export function demoJob(
  sourceId: string,
  state: UploadJobState,
  extra: Partial<UploadJob> = {},
): UploadJob {
  return {
    attempts: 0,
    byteSize: null,
    capturedAt: '2026-08-04T20:07:00.000Z',
    createdAt: '2026-11-10T09:00:00.000Z',
    durationMs: null,
    id: uploadJobId(DEMO_JOURNEY, 'photokit', sourceId),
    journeyId: DEMO_JOURNEY,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    ownerId: DEMO_OWNER,
    sourceId,
    sourceKind: 'photokit',
    state,
    updatedAt: '2026-11-10T09:00:00.000Z',
    ...extra,
  }
}

export function snapshotOf(
  jobs: UploadJob[],
  runtime: QueueSnapshot['runtime'],
  current: QueueSnapshot['current'] = null,
): QueueSnapshot {
  const counts = {} as Record<UploadJobState, number>
  for (const state of UPLOAD_JOB_STATES) counts[state] = 0
  for (const job of jobs) counts[job.state] += 1
  return { counts, current, jobs, runtime }
}
