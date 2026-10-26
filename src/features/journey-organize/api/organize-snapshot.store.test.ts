import { afterEach, describe, expect, it } from 'vitest'
import { dexieSnapshotStore } from '@/features/journey-organize/api/organize-snapshot.store'
import { buildOrganizeSnapshot } from '@/features/journey-organize/model/organize-snapshot'
import { uuid } from '@/features/journey-workspace/test-fixtures'
import { localDb } from '@/shared/lib/local-db'

const J = uuid(999)

const snapshot = buildOrganizeSnapshot(
  J,
  { media: [], moments: [], segments: [] },
  {
    mediaReassignments: [],
    momentsToCreate: [{ id: uuid(1) }],
    momentsToDelete: [],
    momentsToExtend: [],
    momentsToUpdate: [],
    segmentsToDelete: [],
    stageSuggestions: [],
    tripSuggestions: [],
  },
  { runId: 'r', takenAt: '2026-01-01T00:00:00.000Z' },
)

afterEach(async () => {
  await localDb.organizeSnapshots.clear()
})

describe('dexieSnapshotStore', () => {
  it('keeps the last run per journey', async () => {
    await dexieSnapshotStore.put(snapshot)
    await dexieSnapshotStore.put({ ...snapshot, runId: 'r2' })
    expect((await dexieSnapshotStore.get(J))?.runId).toBe('r2')
    await dexieSnapshotStore.remove(J)
    expect(await dexieSnapshotStore.get(J)).toBeNull()
  })

  it('drops an invalid row on read', async () => {
    await localDb.organizeSnapshots.put({ data: { version: 0 }, journeyId: J })
    expect(await dexieSnapshotStore.get(J)).toBeNull()
    expect(await localDb.organizeSnapshots.get(J)).toBeUndefined()
  })

  it('drops a row stored under another journey', async () => {
    await localDb.organizeSnapshots.put({ data: snapshot, journeyId: uuid(5) })
    expect(await dexieSnapshotStore.get(uuid(5))).toBeNull()
  })
})
