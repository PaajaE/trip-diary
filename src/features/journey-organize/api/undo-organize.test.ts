import { describe, expect, it, vi } from 'vitest'
import { memorySnapshotStore } from '@/features/journey-organize/api/organize-snapshot.store'
import {
  undoOrganization,
  type UndoDeps,
} from '@/features/journey-organize/api/undo-organize'
import { buildOrganizeSnapshot } from '@/features/journey-organize/model/organize-snapshot'
import type { MediaItem } from '@/entities/media/model/media-library'
import type {
  Moment,
  MomentPatch,
  NewMoment,
} from '@/entities/moment/model/moment'
import type { NewSegment, Segment } from '@/entities/segment/model/segment'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

const J = uuid(999)
const USER = uuid(500)
const T = (hm: string) => `2026-06-05T${hm}:00.000Z`

const A = mom(10, { endsAt: T('10:00'), startsAt: T('09:00') })
const D = mom(11, {
  endsAt: T('11:00'),
  placeId: uuid(301),
  startsAt: T('10:30'),
})
const C = uuid(20)

interface State {
  media: MediaItem[]
  moments: Moment[]
  segments: Segment[]
}

function setup(
  mutate: (state: State) => void = () => undefined,
  extra: { deletedSegments?: Segment[] } = {},
) {
  const store = memorySnapshotStore()
  const before = {
    media: [
      med(1, { momentId: A.id }),
      med(2, { momentId: D.id, starred: true }),
      med(3, { momentId: null }),
    ],
    moments: [A, D],
    segments: extra.deletedSegments ?? ([] as Segment[]),
  }
  const snapshot = buildOrganizeSnapshot(
    J,
    before,
    {
      mediaReassignments: [
        { mediaId: uuid(2), momentId: C },
        { mediaId: uuid(3), momentId: C },
      ],
      momentsToCreate: [{ id: C }],
      momentsToDelete: [D.id],
      momentsToExtend: [],
      momentsToUpdate: [
        { endsAt: T('10:05'), id: A.id, kind: 'stay', startsAt: T('09:00') },
      ],
      segmentsToDelete: (extra.deletedSegments ?? []).map((s) => s.id),
      stageSuggestions: [],
      tripSuggestions: [{ id: uuid(42) }],
    },
    { runId: 'run-7', takenAt: T('20:00') },
  )
  void store.put(USER, snapshot)
  const state = {
    media: [
      med(1, { momentId: A.id }),
      med(2, { momentId: C, starred: true }),
      med(3, { momentId: C }),
    ],
    moments: [
      { ...A, endsAt: T('10:05') },
      mom(20, { endsAt: T('10:40'), startsAt: T('10:30') }),
    ],
    segments: [seg(42, { kind: 'trip', origin: 'suggested' })],
  }
  mutate(state)
  const calls: string[] = []
  /** Photos a user moves while the undo runs (the conditional write misses). */
  const movedMeanwhile = new Set<string>()
  const deps: Partial<UndoDeps> = {
    moveIfUnchanged: vi.fn(
      (ids: readonly string[], to: string | null, from: string | null) => {
        const moved = ids.filter(
          (id) =>
            !movedMeanwhile.has(id) &&
            state.media.find((m) => m.id === id)?.momentId === from,
        )
        calls.push(`move:${to ?? 'none'}<-${from ?? 'none'}:${moved.join(',')}`)
        return Promise.resolve(moved)
      },
    ),
    createMoments: vi.fn((rows: NewMoment[]) => {
      calls.push(
        `create:${rows.map((r) => `${r.id}/${r.origin ?? ''}/${String(r.locked)}`).join(',')}`,
      )
      return Promise.resolve()
    }),
    createSegments: vi.fn(() => Promise.resolve()),
    deleteMoments: vi.fn((ids: string[]) => {
      calls.push(`delete:${ids.join(',')}`)
      return Promise.resolve()
    }),
    deleteSegments: vi.fn((ids: string[]) => {
      calls.push(`deleteSegments:${ids.join(',')}`)
      return Promise.resolve()
    }),
    forgetRun: vi.fn(),
    getUserId: () => Promise.resolve(USER),
    listMedia: () => Promise.resolve(state.media),
    listMoments: () => Promise.resolve(state.moments),
    listSegments: () => Promise.resolve(state.segments),
    setPlace: vi.fn((id: string, placeId: string) => {
      calls.push(`place:${id}:${placeId}`)
      return Promise.resolve(true)
    }),
    store,
    updateMoment: vi.fn((id: string, patch: MomentPatch) => {
      calls.push(`update:${id}:${Object.keys(patch).sort().join('|')}`)
      return Promise.resolve(mom(10))
    }),
  }
  return { calls, deps, movedMeanwhile, state, store }
}

describe('undoOrganization', () => {
  it('restores the structure in order and drops the snapshot', async () => {
    const { calls, deps, store } = setup()
    const result = await undoOrganization(J, deps)
    expect(result).toEqual({
      counts: {
        mediaRestored: 2,
        momentsDeleted: 1,
        momentsRecreated: 1,
        momentsReverted: 1,
        segmentsDeleted: 1,
        segmentsRecreated: 0,
      },
      kind: 'done',
      skipped: [],
    })
    expect(calls).toEqual([
      `create:${D.id}/auto/false`,
      `place:${D.id}:${uuid(301)}`,
      `move:${D.id}<-${C}:${uuid(2)}`,
      `move:none<-${C}:${uuid(3)}`,
      `update:${A.id}:endsAt|kind|latitude|longitude|startsAt`,
      `delete:${C}`,
      `deleteSegments:${uuid(42)}`,
    ])
    expect(store.rows.has(J)).toBe(false)
    expect(deps.forgetRun).toHaveBeenCalledWith(USER, J, 'run-7')
  })

  it('never writes text, title, cover, lock, star or trash', async () => {
    const { deps } = setup()
    await undoOrganization(J, deps)
    const update = vi.mocked(deps.updateMoment)
    for (const [, patch] of update?.mock.calls ?? []) {
      for (const key of [
        'body',
        'coverMediaId',
        'locked',
        'published',
        'title',
      ])
        expect(patch).not.toHaveProperty(key)
    }
    // The deps have no star or trash function at all: the star of photo 2
    // and the trash cannot be touched by construction.
    expect(Object.keys(deps)).not.toEqual(
      expect.arrayContaining(['trashMedia', 'restoreMedia', 'updateMediaMeta']),
    )
  })

  it('stops at a failing step, keeps the snapshot and converges on rerun', async () => {
    const { calls, deps, store } = setup()
    deps.moveIfUnchanged = vi.fn(() => Promise.reject(new Error('offline')))
    const failed = await undoOrganization(J, deps)
    expect(failed.kind).toBe('failed')
    if (failed.kind === 'failed') {
      expect(failed.step).toBe('moveMedia')
      expect(failed.counts.momentsRecreated).toBe(1)
    }
    expect(store.rows.has(J)).toBe(true)
    expect(calls).not.toContain(`delete:${C}`)
  })

  it('skips a stop locked after the run and reports it', async () => {
    const { calls, deps } = setup((state) => {
      state.moments = state.moments.map((m) =>
        m.id === C ? { ...m, locked: true } : m,
      )
    })
    const result = await undoOrganization(J, deps)
    expect(result.kind).toBe('done')
    if (result.kind === 'done') {
      expect(result.skipped).toEqual(
        expect.arrayContaining([
          { id: C, reason: 'locked', target: 'moment' },
          { id: uuid(2), reason: 'locked', target: 'media' },
        ]),
      )
    }
    expect(calls.some((call) => call.startsWith('delete:'))).toBe(false)
    expect(calls.some((call) => call.startsWith('create:'))).toBe(false)
    // The kept stop A still goes back.
    expect(calls).toContain(
      `update:${A.id}:endsAt|kind|latitude|longitude|startsAt`,
    )
  })

  it('does nothing without a snapshot', async () => {
    const { deps, store } = setup()
    store.rows.clear()
    expect(await undoOrganization(J, deps)).toEqual({ kind: 'nothing' })
  })

  it('drops a snapshot that has nothing left to restore', async () => {
    const { deps, store } = setup((state) => {
      // The user already put everything back by hand and locked C.
      state.moments = [A, D]
      state.media = [
        med(1, { momentId: A.id }),
        med(2, { momentId: D.id }),
        med(3, { momentId: null }),
      ]
      state.segments = []
    })
    expect(await undoOrganization(J, deps)).toEqual({ kind: 'nothing' })
    expect(store.rows.has(J)).toBe(false)
  })

  it('keeps the snapshot of a newer run written during the undo', async () => {
    const { deps, store } = setup()
    const list = deps.listMedia
    deps.listMedia = async (journeyId) => {
      const snapshot = await store.get(USER, J)
      if (snapshot !== null) {
        await store.put(USER, { ...snapshot, runId: 'run-8' })
      }
      return (list ?? (() => Promise.resolve([])))(journeyId)
    }
    await undoOrganization(J, deps)
    expect((await store.get(USER, J))?.runId).toBe('run-8')
    expect(deps.forgetRun).not.toHaveBeenCalled()
  })

  it('never overwrites a photo the user moves during the undo', async () => {
    const { calls, deps, movedMeanwhile } = setup()
    movedMeanwhile.add(uuid(3))
    const result = await undoOrganization(J, deps)
    expect(result.kind).toBe('done')
    if (result.kind === 'done') {
      expect(result.skipped).toEqual(
        expect.arrayContaining([
          { id: uuid(3), reason: 'changed', target: 'media' },
          { id: C, reason: 'notEmpty', target: 'moment' },
        ]),
      )
      expect(result.counts.mediaRestored).toBe(1)
    }
    // Its stop is not deleted while the photo may still be in it.
    expect(calls).not.toContain(`delete:${C}`)
  })

  it('re-creates replaced suggestions with stages first, dropping a gone parent', async () => {
    const stage = seg(43, { origin: 'suggested', startsAt: T('00:00') })
    const trip = seg(44, {
      kind: 'trip',
      origin: 'suggested',
      parentId: uuid(45), // a stage the user deleted after the run
      tripType: 'walk',
    })
    const tripInStage = seg(46, {
      kind: 'trip',
      origin: 'suggested',
      parentId: uuid(43),
      tripType: 'day',
    })
    const { deps } = setup(() => undefined, {
      deletedSegments: [trip, tripInStage, stage],
    })
    const created: { id: string; parentId: string | null | undefined }[][] = []
    deps.createSegments = vi.fn((rows: NewSegment[]) => {
      created.push(rows.map((r) => ({ id: r.id, parentId: r.parentId })))
      return Promise.resolve()
    })
    const result = await undoOrganization(J, deps)
    expect(result.kind).toBe('done')
    expect(created).toEqual([
      [{ id: uuid(43), parentId: null }],
      [
        { id: uuid(44), parentId: null },
        { id: uuid(46), parentId: uuid(43) },
      ],
    ])
  })

  it('finishes (and drops the snapshot) when a suggestion cannot be re-created', async () => {
    const stage = seg(43, { origin: 'suggested' })
    const { deps, store } = setup(() => undefined, { deletedSegments: [stage] })
    deps.createSegments = vi.fn(() => Promise.reject(new Error('fk')))
    const result = await undoOrganization(J, deps)
    expect(result.kind).toBe('done')
    if (result.kind === 'done') {
      expect(result.skipped).toContainEqual({
        id: uuid(43),
        reason: 'missing',
        target: 'segment',
      })
    }
    expect(store.rows.has(J)).toBe(false)
  })

  it('runs under the journey lock (two undos never interleave)', async () => {
    const { deps } = setup()
    const order: string[] = []
    deps.lock = (() => {
      let chain = Promise.resolve()
      return <T>(_journey: string, task: () => Promise<T>) => {
        const run = chain.then(async () => {
          order.push('start')
          const value = await task()
          order.push('end')
          return value
        })
        chain = run.then(
          () => undefined,
          () => undefined,
        )
        return run
      }
    })()
    const [first, second] = await Promise.all([
      undoOrganization(J, deps),
      undoOrganization(J, deps),
    ])
    expect(order).toEqual(['start', 'end', 'start', 'end'])
    expect(first.kind).toBe('done')
    expect(second).toEqual({ kind: 'nothing' })
  })
})
