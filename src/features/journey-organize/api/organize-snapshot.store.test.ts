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

const U = uuid(500)

afterEach(async () => {
  await localDb.organizeSnapshots.clear()
  window.localStorage.clear()
})

describe('dexieSnapshotStore', () => {
  it('keeps the last run per journey and user', async () => {
    await dexieSnapshotStore.put(U, snapshot)
    await dexieSnapshotStore.put(U, { ...snapshot, runId: 'r2' })
    expect((await dexieSnapshotStore.get(U, J))?.runId).toBe('r2')
    // Another user on the device never sees it.
    expect(await dexieSnapshotStore.get(uuid(501), J)).toBeNull()
  })

  it('drops the snapshot only while it is still the one of the run', async () => {
    await dexieSnapshotStore.put(U, { ...snapshot, runId: 'newer' })
    expect(await dexieSnapshotStore.removeRun(U, J, 'r')).toBe(false)
    expect((await dexieSnapshotStore.get(U, J))?.runId).toBe('newer')
    expect(await dexieSnapshotStore.removeRun(U, J, 'newer')).toBe(true)
    expect(await dexieSnapshotStore.get(U, J)).toBeNull()
  })

  it('drops an invalid row on read', async () => {
    await localDb.organizeSnapshots.put({
      data: { version: 0 },
      journeyId: J,
      userId: U,
    })
    expect(await dexieSnapshotStore.get(U, J)).toBeNull()
    expect(await localDb.organizeSnapshots.get(J)).toBeUndefined()
  })

  it('drops a row stored under another journey', async () => {
    await localDb.organizeSnapshots.put({
      data: snapshot,
      journeyId: uuid(5),
      userId: U,
    })
    expect(await dexieSnapshotStore.get(U, uuid(5))).toBeNull()
  })
})
