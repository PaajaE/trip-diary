import { describe, expect, it, vi } from 'vitest'
import { createMemoryUploadJobStore } from '@/entities/media/api/upload-jobs.store'
import { MediaUploadError } from '@/entities/media/model/media'
import { MediaLibraryError } from '@/shared/lib/media-library'
import {
  createUploadQueue,
  type UploadQueueDeps,
} from '@/features/media-import/api/upload-queue'
import type { ImportCandidate } from '@/features/media-import/model/types'
import {
  importCursorKey,
  uploadJobId,
  type UploadJob,
} from '@/entities/media/model/upload-job'

const J = 'journey-1'
const OWNER = 'owner-1'

function candidate(
  sourceId: string,
  over: Partial<ImportCandidate> = {},
): ImportCandidate {
  return {
    capturedAt: '2026-09-11T10:00:00.000Z',
    durationMs: null,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    sourceId,
    ...over,
  }
}

function storedJob(over: Partial<UploadJob>): UploadJob {
  return {
    attempts: 0,
    byteSize: null,
    capturedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    durationMs: null,
    id: uploadJobId(J, 'photokit', 'a'),
    journeyId: J,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    ownerId: OWNER,
    sourceId: 'a',
    sourceKind: 'photokit',
    state: 'pending',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function setup(over: Partial<UploadQueueDeps> = {}) {
  const store = createMemoryUploadJobStore()
  const env = { now: 1_000_000, online: true }
  const timers: { fn: () => void; ms: number }[] = []
  let onlineCallback: (() => void) | null = null
  const process = vi.fn<UploadQueueDeps['process']>((job) =>
    Promise.resolve({ mediaId: `m-${job.sourceId}` }),
  )
  const deps: UploadQueueDeps = {
    clock: () => env.now,
    isOnline: () => env.online,
    journeyId: J,
    listExisting: () => Promise.resolve(new Set<string>()),
    onOnline: (callback) => {
      onlineCallback = callback
      return () => {
        onlineCallback = null
      }
    },
    ownerId: OWNER,
    process,
    schedule: (fn, ms) => {
      const entry = { fn, ms }
      timers.push(entry)
      return () => {
        const index = timers.indexOf(entry)
        if (index >= 0) timers.splice(index, 1)
      }
    },
    store,
    ...over,
  }
  const queue = createUploadQueue(deps)
  return {
    comesOnline: () => {
      env.online = true
      onlineCallback?.()
    },
    env,
    process,
    queue,
    store,
    timers,
  }
}

const states = (queue: ReturnType<typeof setup>['queue']) =>
  Object.fromEntries(
    queue.getSnapshot().jobs.map((job) => [job.sourceId, job.state]),
  )

describe('UploadQueue', () => {
  it('imports sequentially, records media ids and advances the cursor to the newest done capture', async () => {
    const { process, queue, store } = setup()
    let running = 0
    let maxRunning = 0
    process.mockImplementation(async (job) => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await Promise.resolve()
      running -= 1
      return { mediaId: `m-${job.sourceId}` }
    })
    await queue.init()
    await queue.enqueue('photokit', [
      candidate('a', { capturedAt: '2026-09-11T10:00:00.000Z' }),
      candidate('b', { capturedAt: '2026-09-13T10:00:00.000Z' }),
      candidate('v', {
        capturedAt: '2026-09-12T10:00:00.000Z',
        mediaType: 'video',
      }),
    ])
    queue.start()
    await queue.whenSettled()

    expect(maxRunning).toBe(1)
    expect(queue.getSnapshot().counts.done).toBe(3)
    expect(queue.getSnapshot().runtime).toBe('idle')
    expect(queue.getSnapshot().jobs[0]?.mediaId).toBe('m-a')
    const cursor = await store.getCursor(J, 'photokit')
    expect(cursor?.lastCapturedAt).toBe('2026-09-13T10:00:00.000Z')
    expect(cursor?.key).toBe(importCursorKey(J, 'photokit'))
  })

  it('does not move the cursor backwards or for failed jobs', async () => {
    const { process, queue, store } = setup()
    process.mockImplementation((job) =>
      job.sourceId === 'new'
        ? Promise.reject(new MediaUploadError('processing_failed'))
        : Promise.resolve({ mediaId: 'm' }),
    )
    await store.putCursor({
      journeyId: J,
      key: importCursorKey(J, 'photokit'),
      lastCapturedAt: '2026-09-10T00:00:00.000Z',
      sourceKind: 'photokit',
      updatedAt: 'x',
    })
    await queue.init()
    await queue.enqueue('photokit', [
      candidate('old', { capturedAt: '2026-09-01T00:00:00.000Z' }),
      candidate('new', { capturedAt: '2026-09-20T00:00:00.000Z' }),
    ])
    queue.start()
    await queue.whenSettled()
    expect((await store.getCursor(J, 'photokit'))?.lastCapturedAt).toBe(
      '2026-09-10T00:00:00.000Z',
    )
  })

  it('returns jobs left processing after a reload to pending and runs them', async () => {
    const store = createMemoryUploadJobStore()
    await store.putJobs([
      storedJob({ state: 'processing' }),
      storedJob({
        id: uploadJobId(J, 'photokit', 'd'),
        sourceId: 'd',
        state: 'done',
      }),
      storedJob({
        id: uploadJobId(J, 'photokit', 'x'),
        ownerId: 'someone-else',
        sourceId: 'x',
        state: 'processing',
      }),
    ])
    const { process, queue } = setup({ store })
    await queue.init()
    expect(states(queue)).toEqual({ a: 'pending', d: 'done' })
    expect(
      (await store.listJobs(J)).find((j) => j.sourceId === 'a')?.state,
    ).toBe('pending')
    queue.start()
    await queue.whenSettled()
    expect(process).toHaveBeenCalledTimes(1)
    expect(states(queue)).toEqual({ a: 'done', d: 'done' })
  })

  it('retries transient errors with exponential backoff and then succeeds', async () => {
    const { env, process, queue, timers } = setup()
    process
      .mockRejectedValueOnce(new MediaUploadError('upload_failed'))
      .mockRejectedValueOnce(new MediaLibraryError('EXPORT_FAILED', 'x'))
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()

    let job = queue.getSnapshot().jobs[0]
    expect(job).toMatchObject({
      attempts: 1,
      lastError: 'upload_failed',
      state: 'pending',
    })
    expect(timers.map((t) => t.ms)).toEqual([2_000])

    env.now += 2_000
    timers.shift()?.fn()
    await queue.whenSettled()
    job = queue.getSnapshot().jobs[0]
    expect(job).toMatchObject({
      attempts: 2,
      lastError: 'export_failed',
      state: 'pending',
    })
    expect(timers.map((t) => t.ms)).toEqual([4_000])

    env.now += 4_000
    timers.shift()?.fn()
    await queue.whenSettled()
    job = queue.getSnapshot().jobs[0]
    expect(job?.state).toBe('done')
    expect(process).toHaveBeenCalledTimes(3)
  })

  it('does not retry before the backoff has elapsed', async () => {
    const { env, process, queue, timers } = setup()
    process.mockRejectedValueOnce(new MediaUploadError('upload_failed'))
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()
    env.now += 500
    queue.start()
    await queue.whenSettled()
    expect(process).toHaveBeenCalledTimes(1)
    expect(timers).toHaveLength(1)
  })

  it('fails a job after 5 attempts with doubling delays', async () => {
    const { env, process, queue, timers } = setup()
    process.mockRejectedValue(new MediaUploadError('upload_failed'))
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()
    const delays: number[] = []
    while (timers.length > 0) {
      const timer = timers.shift()
      if (timer === undefined) break
      delays.push(timer.ms)
      env.now += timer.ms
      timer.fn()
      await queue.whenSettled()
    }
    expect(delays).toEqual([2_000, 4_000, 8_000, 16_000])
    expect(process).toHaveBeenCalledTimes(5)
    expect(queue.getSnapshot().jobs[0]).toMatchObject({
      attempts: 5,
      state: 'failed',
    })
  })

  it.each([
    ['heic_unsupported', 'skipped'],
    ['video_too_long', 'skipped'],
    ['duplicate', 'skipped'],
    ['video_too_large', 'skipped'],
    ['processing_failed', 'failed'],
  ] as const)('does not retry %s (becomes %s)', async (code, state) => {
    const { process, queue, timers } = setup()
    process.mockRejectedValue(new MediaUploadError(code))
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()
    expect(process).toHaveBeenCalledTimes(1)
    expect(timers).toHaveLength(0)
    expect(queue.getSnapshot().jobs[0]).toMatchObject({
      lastError: code,
      state,
    })
  })

  it('maps PhotoKit errors: missing asset skipped, no access / iCloud-only failed', async () => {
    const { process, queue } = setup()
    process.mockImplementation((job) =>
      Promise.reject(
        new MediaLibraryError(
          job.sourceId === 'gone'
            ? 'NOT_FOUND'
            : job.sourceId === 'cloud'
              ? 'ASSET_UNAVAILABLE'
              : 'NOT_AUTHORIZED',
          'x',
        ),
      ),
    )
    await queue.init()
    await queue.enqueue('photokit', [
      candidate('gone'),
      candidate('cloud'),
      candidate('noauth'),
    ])
    queue.start()
    await queue.whenSettled()
    const jobs = queue.getSnapshot().jobs
    expect(jobs.map((j) => [j.state, j.lastError])).toEqual([
      ['skipped', 'not_found'],
      ['failed', 'asset_unavailable'],
      ['failed', 'not_authorized'],
    ])
  })

  it('pauses after the running job, keeps the rest paused, and resumes', async () => {
    const { process, queue } = setup()
    const ctl: { run?: () => void } = {}
    process.mockImplementationOnce(
      (job) =>
        new Promise((resolve) => {
          ctl.run = () => {
            resolve({ mediaId: `m-${job.sourceId}` })
          }
        }),
    )
    await queue.init()
    await queue.enqueue('photokit', [
      candidate('a'),
      candidate('b'),
      candidate('c'),
    ])
    queue.start()
    await vi.waitFor(() => {
      expect(states(queue).a).toBe('processing')
    })
    await queue.pause()
    expect(states(queue)).toEqual({ a: 'processing', b: 'paused', c: 'paused' })
    ctl.run?.()
    await queue.whenSettled()
    expect(states(queue)).toEqual({ a: 'done', b: 'paused', c: 'paused' })
    expect(queue.getSnapshot().runtime).toBe('paused')
    expect(process).toHaveBeenCalledTimes(1)

    await queue.resume()
    await queue.whenSettled()
    expect(states(queue)).toEqual({ a: 'done', b: 'done', c: 'done' })
  })

  it('a transient failure of the in-flight job during pause leaves it paused', async () => {
    const { process, queue } = setup()
    const ctl: { run?: () => void } = {}
    process.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          ctl.run = () => {
            reject(new MediaUploadError('upload_failed'))
          }
        }),
    )
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await vi.waitFor(() => {
      expect(states(queue).a).toBe('processing')
    })
    await queue.pause()
    ctl.run?.()
    await queue.whenSettled()
    expect(states(queue).a).toBe('paused')
  })

  it('stops while offline and continues when the browser is online again', async () => {
    const { comesOnline, env, process, queue } = setup()
    env.online = false
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()
    expect(queue.getSnapshot().runtime).toBe('waiting_online')
    expect(process).not.toHaveBeenCalled()

    comesOnline()
    await queue.whenSettled()
    expect(process).toHaveBeenCalledTimes(1)
    expect(states(queue).a).toBe('done')
  })

  it('a failure that happens offline does not use up an attempt', async () => {
    const { comesOnline, env, process, queue } = setup()
    process.mockImplementationOnce(() => {
      env.online = false
      return Promise.reject(new MediaUploadError('upload_failed'))
    })
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()
    expect(queue.getSnapshot().runtime).toBe('waiting_online')
    expect(queue.getSnapshot().jobs[0]).toMatchObject({
      attempts: 0,
      state: 'pending',
    })
    comesOnline()
    await queue.whenSettled()
    expect(states(queue).a).toBe('done')
  })

  it('cancel removes waiting jobs but keeps finished ones', async () => {
    const { process, queue, store } = setup()
    await queue.init()
    await queue.enqueue('photokit', [candidate('a'), candidate('b')])
    queue.start()
    await queue.whenSettled()
    await queue.enqueue('photokit', [candidate('c')])
    await queue.cancel()
    expect(states(queue)).toEqual({ a: 'done', b: 'done' })
    expect((await store.listJobs(J)).map((j) => j.sourceId).sort()).toEqual([
      'a',
      'b',
    ])
    expect(process).toHaveBeenCalledTimes(2)
  })

  it('retryFailed puts failed jobs back with fresh attempts', async () => {
    const { process, queue } = setup()
    process.mockRejectedValueOnce(new MediaUploadError('processing_failed'))
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await queue.whenSettled()
    expect(states(queue).a).toBe('failed')
    await queue.retryFailed()
    await queue.whenSettled()
    expect(states(queue).a).toBe('done')
  })

  it('reports the current phase from the job hooks', async () => {
    const { process, queue } = setup()
    const ctl: { run?: () => void } = {}
    process.mockImplementationOnce(
      (job, hooks) =>
        new Promise((resolve) => {
          hooks.onPhase('uploading', 0.5)
          ctl.run = () => {
            resolve({ mediaId: `m-${job.sourceId}` })
          }
        }),
    )
    await queue.init()
    await queue.enqueue('photokit', [candidate('a')])
    queue.start()
    await vi.waitFor(() => {
      expect(queue.getSnapshot().current).toMatchObject({
        fraction: 0.5,
        phase: 'uploading',
        sourceId: 'a',
      })
    })
    ctl.run?.()
    await queue.whenSettled()
    expect(queue.getSnapshot().current).toBeNull()
  })

  describe('enqueue and dedupe', () => {
    it('asks once for existing source ids and skips them as duplicates before any work', async () => {
      const listExisting = vi.fn(() => Promise.resolve(new Set(['b'])))
      const { process, queue } = setup({ listExisting })
      await queue.init()
      const result = await queue.enqueue('photokit', [
        candidate('a'),
        candidate('b'),
        candidate('a'),
        candidate('long', { mediaType: 'video', skipReason: 'video_too_long' }),
      ])
      expect(listExisting).toHaveBeenCalledTimes(1)
      expect(listExisting).toHaveBeenCalledWith(OWNER, ['a', 'b'])
      expect(result).toEqual({ enqueued: 1, known: 0, skipped: 2 })
      queue.start()
      await queue.whenSettled()
      expect(process).toHaveBeenCalledTimes(1)
      const byId = Object.fromEntries(
        queue
          .getSnapshot()
          .jobs.map((j) => [j.sourceId, [j.state, j.lastError]]),
      )
      expect(byId).toEqual({
        a: ['done', undefined],
        b: ['skipped', 'duplicate'],
        long: ['skipped', 'video_too_long'],
      })
    })

    it('still enqueues when the dedupe query fails (the server rejects duplicates later)', async () => {
      const { queue } = setup({
        listExisting: () => Promise.reject(new Error('offline')),
      })
      await queue.init()
      const result = await queue.enqueue('photokit', [candidate('a')])
      expect(result.enqueued).toBe(1)
    })

    it('treats a server duplicate as skipped', async () => {
      const { process, queue } = setup()
      process.mockRejectedValue(new MediaUploadError('duplicate'))
      await queue.init()
      await queue.enqueue('photokit', [candidate('a')])
      queue.start()
      await queue.whenSettled()
      expect(queue.getSnapshot().jobs[0]).toMatchObject({
        lastError: 'duplicate',
        state: 'skipped',
      })
    })

    it('leaves known jobs alone and resets failed ones', async () => {
      const { process, queue } = setup()
      process.mockRejectedValueOnce(new MediaUploadError('processing_failed'))
      await queue.init()
      await queue.enqueue('photokit', [candidate('a'), candidate('b')])
      queue.start()
      await queue.whenSettled()
      const again = await queue.enqueue('photokit', [
        candidate('a'),
        candidate('b'),
      ])
      expect(again).toEqual({ enqueued: 1, known: 1, skipped: 0 })
      expect(states(queue)).toEqual({ a: 'pending', b: 'done' })
    })
  })
})
