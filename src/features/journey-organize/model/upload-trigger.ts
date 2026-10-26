/**
 * When an upload batch is over and which media it brought (input of the
 * automatic organisation). Structural types, so the import queue snapshot
 * fits without a dependency on it.
 */

export interface TriggerJob {
  mediaId?: string | undefined
  state: string
}

export interface TriggerSnapshot {
  jobs: readonly TriggerJob[]
  runtime: string
}

/** Media ids of the finished jobs, in job order. */
export function uploadedMediaIds(jobs: readonly TriggerJob[]): string[] {
  const out: string[] = []
  for (const job of jobs) {
    if (job.state === 'done' && job.mediaId !== undefined) out.push(job.mediaId)
  }
  return out
}

/**
 * The batch is over: the worker stopped and nothing waits or runs (failed,
 * skipped or paused jobs do not hold the organisation back).
 */
export function batchSettled(snapshot: TriggerSnapshot): boolean {
  return (
    snapshot.runtime !== 'running' &&
    snapshot.runtime !== 'waiting_online' &&
    !snapshot.jobs.some(
      (job) => job.state === 'pending' || job.state === 'processing',
    )
  )
}

/** Finished uploads not in `known` (ids seen when the screen opened, or handed over). */
export function freshUploads(
  snapshot: TriggerSnapshot,
  known: ReadonlySet<string>,
): string[] {
  return uploadedMediaIds(snapshot.jobs).filter((id) => !known.has(id))
}
