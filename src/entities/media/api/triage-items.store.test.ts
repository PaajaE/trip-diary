import { describe, expect, it } from 'vitest'
import {
  createMemoryTriageItemStore,
  dexieTriageItemStore,
} from '@/entities/media/api/triage-items.store'
import {
  triageItemId,
  type TriageItem,
} from '@/entities/media/model/triage-item'
import { localDb } from '@/shared/lib/local-db'

function row(id: string, owner = 'o', journey = 'j'): TriageItem {
  return {
    bestPending: false,
    burstId: null,
    byteSize: null,
    capturedAt: null,
    durationMs: null,
    icloudOnly: false,
    id: triageItemId(journey, 'photokit', id),
    journeyId: journey,
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    ownerId: owner,
    place: null,
    selectionId: 's',
    sourceId: id,
    sourceKind: 'photokit',
    status: 'found',
    updatedAt: 'x',
  }
}

describe.each([
  ['dexie', () => dexieTriageItemStore],
  ['memory', () => createMemoryTriageItemStore()],
])('%s triage store', (_name, make) => {
  it('stores, scopes by journey and owner, updates and deletes', async () => {
    await localDb.triageItems.clear()
    const store = make()
    await store.putItems([
      row('a'),
      row('b'),
      row('c', 'other'),
      row('d', 'o', 'k'),
    ])
    expect(
      (await store.listItems('j', 'o')).map((i) => i.sourceId).sort(),
    ).toEqual(['a', 'b'])
    await store.putItems([{ ...row('a'), status: 'kept' }])
    const items = await store.listItems('j', 'o')
    expect(items.find((i) => i.sourceId === 'a')?.status).toBe('kept')
    await store.deleteItems([row('a').id])
    expect(await store.listItems('j', 'o')).toHaveLength(1)
  })
})

describe('dexie triage store', () => {
  it('drops rows that no longer parse', async () => {
    await localDb.triageItems.clear()
    await localDb.triageItems.put({ id: 'bad', journeyId: 'j' } as never)
    expect(await dexieTriageItemStore.listItems('j', 'o')).toEqual([])
  })
})
