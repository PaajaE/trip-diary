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
import type { Segment } from '@/entities/segment/model/segment'
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

function setup(
  mutate: (state: {
    media: MediaItem[]
    moments: Moment[]
    segments: Segment[]
  }) => void = () => undefined,
) {
  const store = memorySnapshotStore()
  const before = {
    media: [
      med(1, { momentId: A.id }),
      med(2, { momentId: D.id, starred: true }),
      med(3, { momentId: null }),
    ],
    moments: [A, D],
    segments: [] as Segment[],
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
      segmentsToDelete: [],
      stageSuggestions: [],
      tripSuggestions: [{ id: uuid(42) }],
    },
    { runId: 'run-7', takenAt: T('20:00') },
  )
  void store.put(snapshot)
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
  const deps: Partial<UndoDeps> = {
    assignMedia: vi.fn((ids: string[], momentId: string) => {
      calls.push(`assign:${momentId}:${ids.join(',')}`)
      return Promise.resolve()
    }),
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
    detachMedia: vi.fn((ids: readonly string[]) => {
      calls.push(`detach:${ids.join(',')}`)
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
  return { calls, deps, store }
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
      `assign:${D.id}:${uuid(2)}`,
      `detach:${uuid(3)}`,
      `update:${A.id}:endsAt|kind|latitude|longitude|startsAt`,
      `delete:${C}`,
      `deleteSegments:${uuid(42)}`,
    ])
    expect(store.rows.has(J)).toBe(false)
    expect(deps.forgetRun).toHaveBeenCalledWith(J, 'run-7')
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
    deps.detachMedia = vi.fn(() => Promise.reject(new Error('offline')))
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
})
