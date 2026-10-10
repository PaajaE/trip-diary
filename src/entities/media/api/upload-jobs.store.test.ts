import { beforeEach, describe, expect, it } from 'vitest'
import { dexieUploadJobStore } from '@/entities/media/api/upload-jobs.store'
import {
  importCursorKey,
  uploadJobId,
  type UploadJob,
} from '@/entities/media/model/upload-job'
import { createUploadQueue } from '@/features/media-import/api/upload-queue'
import { localDb } from '@/shared/lib/local-db'

const job: UploadJob = {
  attempts: 0,
  byteSize: null,
  capturedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  durationMs: null,
  id: uploadJobId('j', 'photokit', 'a'),
  journeyId: 'j',
  latitude: null,
  longitude: null,
  mediaType: 'photo',
  ownerId: 'o',
  sourceId: 'a',
  sourceKind: 'photokit',
  state: 'processing',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(async () => {
  await localDb.uploadJobs.clear()
  await localDb.importCursors.clear()
})

describe('Dexie upload job store', () => {
  it('declares the new tables in schema version 17 (existing tables untouched)', () => {
    expect(localDb.verno).toBe(17)
    expect(localDb.uploadJobs.schema.primKey.name).toBe('id')
    expect(localDb.importCursors.schema.primKey.name).toBe('key')
    expect(localDb.entries.schema.primKey.name).toBe('id')
  })

  it('stores jobs per journey, fills defaults for old rows and drops unreadable ones', async () => {
    await dexieUploadJobStore.putJobs([job])
    await localDb.uploadJobs.put({
      ...job,
      id: 'old',
      sourceId: 'old',
      // Row from an earlier shape: optional columns missing.
      byteSize: undefined,
      latitude: undefined,
    } as unknown as UploadJob)
    await localDb.uploadJobs.put({
      id: 'garbage',
      journeyId: 'j',
    } as unknown as UploadJob)
    await dexieUploadJobStore.putJobs([{ ...job, id: 'other', journeyId: 'k' }])

    const jobs = await dexieUploadJobStore.listJobs('j')
    expect(jobs.map((j) => j.id).sort()).toEqual([job.id, 'old'].sort())
    expect(jobs.find((j) => j.id === 'old')).toMatchObject({
      byteSize: null,
      latitude: null,
    })
    await dexieUploadJobStore.deleteJobs(['old'])
    expect(await dexieUploadJobStore.listJobs('j')).toHaveLength(1)
  })

  it('round-trips the cursor', async () => {
    expect(await dexieUploadJobStore.getCursor('j', 'photokit')).toBeNull()
    await dexieUploadJobStore.putCursor({
      journeyId: 'j',
      key: importCursorKey('j', 'photokit'),
      lastCapturedAt: '2026-09-11T10:00:00.000Z',
      sourceKind: 'photokit',
      updatedAt: 'x',
    })
    expect(
      (await dexieUploadJobStore.getCursor('j', 'photokit'))?.lastCapturedAt,
    ).toBe('2026-09-11T10:00:00.000Z')
    expect(await dexieUploadJobStore.getCursor('j', 'web-files')).toBeNull()
  })

  it('a new queue on the same Dexie store recovers a job left processing', async () => {
    await dexieUploadJobStore.putJobs([job])
    const queue = createUploadQueue({
      clock: () => 0,
      isOnline: () => true,
      journeyId: 'j',
      listExisting: () => Promise.resolve(new Set<string>()),
      onOnline: () => () => undefined,
      ownerId: 'o',
      process: () => Promise.resolve({ mediaId: 'm' }),
      schedule: () => () => undefined,
      store: dexieUploadJobStore,
    })
    await queue.init()
    expect(queue.getSnapshot().counts.pending).toBe(1)
    expect((await dexieUploadJobStore.listJobs('j'))[0]?.state).toBe('pending')
    queue.start()
    await queue.whenSettled()
    expect((await dexieUploadJobStore.listJobs('j'))[0]).toMatchObject({
      mediaId: 'm',
      state: 'done',
    })
  })
})
