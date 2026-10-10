import {
  importCursorKey,
  uploadJobSchema,
  type ImportCursor,
  type ImportSourceKind,
  type UploadJob,
} from '@/entities/media/model/upload-job'
import { localDb } from '@/shared/lib/local-db'

/** Persistence seam of the upload queue (Dexie in the app, memory in tests). */
export interface UploadJobStore {
  deleteJobs(ids: readonly string[]): Promise<void>
  getCursor(
    journeyId: string,
    sourceKind: ImportSourceKind,
  ): Promise<ImportCursor | null>
  listJobs(journeyId: string): Promise<UploadJob[]>
  putCursor(cursor: ImportCursor): Promise<void>
  putJobs(jobs: readonly UploadJob[]): Promise<void>
}

export const dexieUploadJobStore: UploadJobStore = {
  async deleteJobs(ids) {
    await localDb.uploadJobs.bulkDelete([...ids])
  },
  async getCursor(journeyId, sourceKind) {
    return (
      (await localDb.importCursors.get(
        importCursorKey(journeyId, sourceKind),
      )) ?? null
    )
  },
  async listJobs(journeyId) {
    const rows = await localDb.uploadJobs
      .where('journeyId')
      .equals(journeyId)
      .toArray()
    // Rows written by another app version may not match; drop what we cannot read.
    const jobs: UploadJob[] = []
    for (const row of rows) {
      const parsed = uploadJobSchema.safeParse(row)
      if (parsed.success) jobs.push(parsed.data)
    }
    return jobs
  },
  async putCursor(cursor) {
    await localDb.importCursors.put(cursor)
  },
  async putJobs(jobs) {
    await localDb.uploadJobs.bulkPut([...jobs])
  },
}

export function createMemoryUploadJobStore(): UploadJobStore {
  const jobs = new Map<string, UploadJob>()
  const cursors = new Map<string, ImportCursor>()
  return {
    deleteJobs(ids) {
      for (const id of ids) jobs.delete(id)
      return Promise.resolve()
    },
    getCursor(journeyId, sourceKind) {
      return Promise.resolve(
        cursors.get(importCursorKey(journeyId, sourceKind)) ?? null,
      )
    },
    listJobs(journeyId) {
      return Promise.resolve(
        [...jobs.values()].filter((job) => job.journeyId === journeyId),
      )
    },
    putCursor(cursor) {
      cursors.set(cursor.key, cursor)
      return Promise.resolve()
    },
    putJobs(items) {
      for (const job of items) jobs.set(job.id, { ...job })
      return Promise.resolve()
    },
  }
}
