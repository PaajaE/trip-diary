import { describe, expect, it, vi } from 'vitest'
import { runAutoOrganize } from '@/features/journey-organize/api/auto-organize'
import type { OrganizeDeps } from '@/features/journey-organize/api/organize-journey'
import { memorySnapshotStore } from '@/features/journey-organize/api/organize-snapshot.store'
import type { AutoRunOutcome } from '@/features/journey-organize/model/auto-organize'
import { med, mom, uuid } from '@/features/journey-workspace/test-fixtures'

const J = uuid(999)
const USER = uuid(500)

function organizeDeps(
  calls: string[],
  media = [
    med(1, {
      capturedAt: '2026-09-01T09:00:00+00:00',
      latitude: 51.1,
      longitude: -115.3,
    }),
    med(2, {
      capturedAt: '2026-09-01T09:10:00+00:00',
      latitude: 51.1,
      longitude: -115.3,
    }),
  ],
): Partial<OrganizeDeps> {
  let n = 0
  return {
    assignMedia: vi.fn(() => {
      calls.push('assign')
      return Promise.resolve()
    }),
    createMoments: vi.fn(() => {
      calls.push('createMoments')
      return Promise.resolve()
    }),
    createSegments: vi.fn(() => Promise.resolve()),
    deleteMoments: vi.fn(() => Promise.resolve()),
    deleteSegments: vi.fn(() => Promise.resolve()),
    getHomeTz: () => Promise.resolve('UTC'),
    getUserId: () => Promise.resolve(USER),
    listMedia: () => Promise.resolve(media),
    listMoments: () => Promise.resolve([]),
    listPlaces: () => Promise.resolve([]),
    listSegments: () => Promise.resolve([]),
    newId: () => uuid(700 + (n += 1)),
    updateMoment: vi.fn(() => Promise.resolve(mom(1))),
  }
}

function context() {
  const applied: AutoRunOutcome[] = []
  return {
    applied,
    value: {
      onApplied: (outcome: AutoRunOutcome) => applied.push(outcome),
      stopped: () => false,
    },
  }
}

describe('runAutoOrganize', () => {
  it('saves the undo snapshot before writing, then remembers and names the new stops', async () => {
    const calls: string[] = []
    const store = memorySnapshotStore()
    const put = store.put
    store.put = (snapshot) => {
      calls.push('snapshot')
      return put(snapshot)
    }
    const rememberRun = vi.fn()
    const resolvePlaces = vi.fn(() => {
      calls.push('places')
      return Promise.resolve(null)
    })
    const ctx = context()
    const outcome = await runAutoOrganize(J, ctx.value, {
      newRunId: () => 'run-1',
      now: () => Date.parse('2026-09-01T20:00:00Z'),
      organize: organizeDeps(calls),
      rememberRun,
      resolvePlaces,
      store,
    })
    expect(outcome.kind).toBe('applied')
    expect(calls[0]).toBe('snapshot')
    expect(calls.indexOf('createMoments')).toBeGreaterThan(0)
    expect(calls[calls.length - 1]).toBe('places')
    const snapshot = await store.get(J)
    expect(snapshot?.runId).toBe('run-1')
    expect(snapshot?.takenAt).toBe('2026-09-01T20:00:00.000Z')
    const created =
      outcome.kind === 'applied' ? outcome.createdMomentIds : ['?']
    expect(created.length).toBeGreaterThan(0)
    expect(snapshot?.createdMomentIds).toEqual(created)
    expect(rememberRun).toHaveBeenCalledWith(J, 'run-1', created)
    expect(ctx.applied).toEqual([outcome])
  })

  it('writes nothing (and keeps the old snapshot) when the plan is empty', async () => {
    const calls: string[] = []
    const store = memorySnapshotStore()
    store.rows.set(J, { old: true })
    const resolvePlaces = vi.fn(() => Promise.resolve(null))
    const ctx = context()
    const outcome = await runAutoOrganize(J, ctx.value, {
      organize: organizeDeps(calls, []),
      resolvePlaces,
      store,
    })
    expect(outcome).toEqual({ kind: 'nothing' })
    expect(store.rows.get(J)).toEqual({ old: true })
    expect(calls).toEqual([])
    expect(resolvePlaces).not.toHaveBeenCalled()
  })

  it('does not write anything when the snapshot cannot be saved', async () => {
    const calls: string[] = []
    const store = memorySnapshotStore()
    store.put = () => Promise.reject(new Error('quota'))
    const outcome = await runAutoOrganize(J, context().value, {
      organize: organizeDeps(calls),
      resolvePlaces: () => Promise.resolve(null),
      store,
    })
    expect(outcome.kind).toBe('failed')
    expect(calls).toEqual([])
  })

  it('reports a partial run with the stops it did create', async () => {
    const calls: string[] = []
    const deps = organizeDeps(calls)
    deps.assignMedia = () => Promise.reject(new Error('offline'))
    const rememberRun = vi.fn()
    const outcome = await runAutoOrganize(J, context().value, {
      newRunId: () => 'run-2',
      organize: deps,
      rememberRun,
      resolvePlaces: () => Promise.resolve(null),
      store: memorySnapshotStore(),
    })
    expect(outcome.kind).toBe('failed')
    if (outcome.kind === 'failed') {
      expect(outcome.createdMomentIds.length).toBe(
        outcome.counts.momentsCreated,
      )
      expect(rememberRun).toHaveBeenCalledWith(
        J,
        'run-2',
        outcome.createdMomentIds,
      )
    }
  })
})
