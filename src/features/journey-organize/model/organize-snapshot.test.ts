import { describe, expect, it } from 'vitest'
import {
  buildOrganizeSnapshot,
  contentKeyOf,
  isRestoreEmpty,
  parseOrganizeSnapshot,
  planRestore,
  type OrganizeSnapshot,
  type SnapshotPlan,
} from '@/features/journey-organize/model/organize-snapshot'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

const J = uuid(999)
const META = { runId: 'run-1', takenAt: '2026-06-05T20:00:00.000Z' }

const T = (hm: string) => `2026-06-05T${hm}:00.000Z`

/**
 * Before the run: auto stop A (photos 1, 2), auto stop D (photo 3, deleted
 * by the run), locked stop L (photo 5), new photos 4 and 6 without a stop.
 * The run: creates C (photos 3, 4), updates A (range), extends L (photo 6),
 * deletes D, replaces suggested segment S1 by S2.
 */
const A = mom(10, { endsAt: T('10:00'), startsAt: T('09:00') })
const D = mom(11, {
  endsAt: T('11:00'),
  latitude: 51,
  longitude: -116,
  placeId: uuid(301),
  startsAt: T('10:30'),
})
const L = mom(12, {
  endsAt: T('13:00'),
  locked: true,
  startsAt: T('12:00'),
  title: 'Peyto Lake',
})
const S1 = seg(41, { kind: 'trip', origin: 'suggested', tripType: 'walk' })

const before = {
  media: [
    med(1, { momentId: A.id }),
    med(2, { momentId: A.id }),
    med(3, { momentId: D.id }),
    med(4, { momentId: null }),
    med(5, { momentId: L.id }),
    med(6, { momentId: null }),
  ],
  moments: [A, D, L],
  segments: [S1],
}

const C = uuid(20)
const S2 = uuid(42)

const plan: SnapshotPlan = {
  mediaReassignments: [
    { mediaId: uuid(3), momentId: C },
    { mediaId: uuid(4), momentId: C },
    { mediaId: uuid(6), momentId: L.id },
  ],
  momentsToCreate: [{ id: C }],
  momentsToDelete: [D.id],
  momentsToExtend: [{ endsAt: T('13:30'), id: L.id, startsAt: T('12:00') }],
  momentsToUpdate: [
    { endsAt: T('10:10'), id: A.id, kind: 'stay', startsAt: T('09:00') },
  ],
  segmentsToDelete: [S1.id],
  stageSuggestions: [],
  tripSuggestions: [{ id: S2 }],
}

function snapshot(): OrganizeSnapshot {
  return buildOrganizeSnapshot(J, before, plan, META)
}

/** The state right after the run was applied completely. */
function afterRun() {
  return {
    media: [
      med(1, { momentId: A.id }),
      med(2, { momentId: A.id }),
      med(3, { momentId: C }),
      med(4, { momentId: C }),
      med(5, { momentId: L.id }),
      med(6, { momentId: L.id }),
    ],
    moments: [
      { ...A, endsAt: T('10:10') },
      mom(20, { endsAt: T('11:00'), startsAt: T('10:30') }),
      { ...L, endsAt: T('13:30') },
    ],
    segments: [seg(42, { kind: 'trip', origin: 'suggested' })],
  }
}

describe('buildOrganizeSnapshot', () => {
  it('captures structure only, from the state the plan was made on', () => {
    const snap = snapshot()
    expect(parseOrganizeSnapshot(snap)).toEqual(snap)
    expect(snap.createdMomentIds).toEqual([C])
    expect(snap.deletedMoments).toEqual([
      {
        endsAt: D.endsAt,
        id: D.id,
        kind: 'stay',
        latitude: 51,
        longitude: -116,
        placeId: uuid(301),
        startsAt: D.startsAt,
      },
    ])
    expect(snap.updatedMoments[0]?.before.endsAt).toBe(T('10:00'))
    expect(snap.updatedMoments[0]?.after.endsAt).toBe(T('10:10'))
    expect(snap.extensions).toEqual([
      {
        after: { endsAt: T('13:30'), startsAt: T('12:00') },
        before: { endsAt: T('13:00'), startsAt: T('12:00') },
        contentKey: contentKeyOf(L),
        id: L.id,
      },
    ])
    expect(snap.media).toEqual([
      { after: C, before: D.id, mediaId: uuid(3) },
      { after: C, before: null, mediaId: uuid(4) },
      { after: L.id, before: null, mediaId: uuid(6) },
    ])
    expect(snap.createdSegmentIds).toEqual([S2])
    expect(snap.deletedSegments.map((s) => s.id)).toEqual([S1.id])
    // No text, title, cover, star or trash state is ever part of it.
    expect(JSON.stringify(snap)).not.toMatch(
      /title":"Peyto|body|cover|starred|deleted_at/,
    )
  })

  it('treats a dangling moment reference as "no stop"', () => {
    const snap = buildOrganizeSnapshot(
      J,
      { ...before, media: [med(4, { momentId: uuid(777) })] },
      { ...plan, mediaReassignments: [{ mediaId: uuid(4), momentId: C }] },
      META,
    )
    expect(snap.media).toEqual([{ after: C, before: null, mediaId: uuid(4) }])
  })

  it('rejects invalid stored data', () => {
    expect(parseOrganizeSnapshot({ version: 2 })).toBeNull()
    expect(parseOrganizeSnapshot(null)).toBeNull()
  })
})

describe('planRestore', () => {
  it('restores everything after a complete run', () => {
    const restore = planRestore(snapshot(), afterRun())
    expect(restore.recreateMoments.map((m) => m.id)).toEqual([D.id])
    expect(restore.moveMedia).toEqual([
      // Each group moves back only from the stop the run put it in.
      { from: C, mediaIds: [uuid(3)], momentId: D.id },
      { from: L.id, mediaIds: [uuid(6)], momentId: null },
      { from: C, mediaIds: [uuid(4)], momentId: null },
    ])
    expect(restore.revertMoments).toEqual([
      {
        id: A.id,
        patch: {
          endsAt: T('10:00'),
          kind: 'stay',
          latitude: null,
          longitude: null,
          startsAt: T('09:00'),
        },
      },
    ])
    expect(restore.revertExtensions).toEqual([
      { endsAt: T('13:00'), id: L.id, startsAt: T('12:00') },
    ])
    expect(restore.deleteMoments).toEqual([C])
    expect(restore.deleteSegments).toEqual([S2])
    expect(restore.recreateSegments.map((s) => s.id)).toEqual([S1.id])
    expect(restore.skipped).toEqual([])
  })

  it('is empty once the state is as before (idempotent rerun)', () => {
    const restore = planRestore(snapshot(), before)
    expect(restore.deleteMoments).toEqual([])
    expect(isRestoreEmpty(restore)).toBe(true)
  })

  it('handles a run that stopped half way (only what was applied goes back)', () => {
    // Only C was created and photo 3 moved; nothing else was written.
    const partial = {
      media: [...before.media.filter((m) => m.id !== uuid(3))],
      moments: [...before.moments, mom(20)],
      segments: before.segments,
    }
    partial.media.push(med(3, { momentId: C }))
    const restore = planRestore(snapshot(), partial)
    expect(restore.recreateMoments).toEqual([]) // D still exists
    expect(restore.moveMedia).toEqual([
      { from: C, mediaIds: [uuid(3)], momentId: D.id },
    ])
    expect(restore.revertMoments).toEqual([])
    expect(restore.revertExtensions).toEqual([])
    expect(restore.deleteMoments).toEqual([C])
    expect(restore.deleteSegments).toEqual([])
    expect(restore.recreateSegments).toEqual([])
    expect(restore.skipped).toEqual([])
  })

  it('skips a stop the user locked after the run and keeps its photos', () => {
    const state = afterRun()
    state.moments = state.moments.map((m) =>
      m.id === C ? { ...m, locked: true } : m,
    )
    const restore = planRestore(snapshot(), state)
    expect(restore.deleteMoments).toEqual([])
    expect(restore.skipped).toEqual(
      expect.arrayContaining([
        { id: uuid(3), reason: 'locked', target: 'media' },
        { id: uuid(4), reason: 'locked', target: 'media' },
        { id: C, reason: 'locked', target: 'moment' },
      ]),
    )
    // D gets nothing back, so it is not re-created as an empty stop.
    expect(restore.recreateMoments).toEqual([])
    // The rest still goes back.
    expect(restore.revertMoments.map((r) => r.id)).toEqual([A.id])
    expect(restore.moveMedia).toEqual([
      { from: L.id, mediaIds: [uuid(6)], momentId: null },
    ])
  })

  it('skips a kept stop the user renamed after the run', () => {
    const state = afterRun()
    state.moments = state.moments.map((m) =>
      m.id === A.id ? { ...m, title: 'Bow Lake' } : m,
    )
    const restore = planRestore(snapshot(), state)
    expect(restore.revertMoments).toEqual([])
    expect(restore.skipped).toContainEqual({
      id: A.id,
      reason: 'locked',
      target: 'moment',
    })
  })

  it('leaves trashed photos in the trash and a moved photo where it is', () => {
    const state = afterRun()
    // Photo 4 was trashed (not listed), photo 3 was moved by the user to A
    // (move_media locks both stops: A is now locked).
    state.media = state.media
      .filter((m) => m.id !== uuid(4))
      .map((m) => (m.id === uuid(3) ? { ...m, momentId: A.id } : m))
    state.moments = state.moments.map((m) =>
      m.id === A.id || m.id === C ? { ...m, locked: true } : m,
    )
    const restore = planRestore(snapshot(), state)
    expect(restore.skipped).toEqual(
      expect.arrayContaining([
        { id: uuid(4), reason: 'trashed', target: 'media' },
        { id: uuid(3), reason: 'changed', target: 'media' },
        { id: A.id, reason: 'locked', target: 'moment' },
      ]),
    )
    expect(restore.moveMedia).toEqual([
      { from: L.id, mediaIds: [uuid(6)], momentId: null },
    ])
    expect(restore.recreateMoments).toEqual([])
  })

  it('keeps the range of a confirmed stop the user changed after the run', () => {
    const state = afterRun()
    state.moments = state.moments.map((m) =>
      m.id === L.id ? { ...m, endsAt: T('14:00') } : m,
    )
    const restore = planRestore(snapshot(), state)
    expect(restore.revertExtensions).toEqual([])
    expect(restore.skipped).toEqual(
      expect.arrayContaining([
        { id: L.id, reason: 'changed', target: 'moment' },
        { id: uuid(6), reason: 'changed', target: 'media' },
      ]),
    )
  })

  it('never deletes a suggestion the user accepted', () => {
    const state = afterRun()
    state.segments = [seg(42, { kind: 'trip', origin: 'accepted' })]
    const restore = planRestore(snapshot(), state)
    expect(restore.deleteSegments).toEqual([])
    expect(restore.skipped).toContainEqual({
      id: S2,
      reason: 'decided',
      target: 'segment',
    })
  })

  it('restores the place a moved stop lost, but keeps a newly found one', () => {
    const withPlace = mom(10, {
      endsAt: T('10:00'),
      placeId: uuid(300),
      startsAt: T('09:00'),
    })
    const snap = buildOrganizeSnapshot(
      J,
      { ...before, moments: [withPlace, D, L] },
      plan,
      META,
    )
    const state = afterRun()
    state.moments = state.moments.map((m) =>
      m.id === A.id ? { ...m, placeId: uuid(302) } : m,
    )
    const restore = planRestore(snap, state)
    expect(restore.revertMoments[0]?.patch.placeId).toBe(uuid(300))

    const plain = planRestore(snapshot(), state)
    expect(plain.revertMoments[0]?.patch).not.toHaveProperty('placeId')
  })

  it('keeps the new photos of a confirmed stop whose content changed since', () => {
    const state = afterRun()
    state.moments = state.moments.map((m) =>
      m.id === L.id ? { ...m, body: 'Krásný výhled' } : m,
    )
    const restore = planRestore(snapshot(), state)
    expect(restore.revertExtensions).toEqual([])
    expect(restore.skipped).toEqual(
      expect.arrayContaining([
        { id: L.id, reason: 'changed', target: 'moment' },
        { id: uuid(6), reason: 'changed', target: 'media' },
      ]),
    )
  })

  it('never takes the cover photo out of its stop', () => {
    const state = afterRun()
    state.moments = state.moments.map((m) =>
      m.id === L.id ? { ...m, coverMediaId: uuid(6) } : m,
    )
    const restore = planRestore(snapshot(), state)
    expect(restore.skipped).toContainEqual({
      id: uuid(6),
      reason: 'cover',
      target: 'media',
    })
    expect(restore.moveMedia.flatMap((g) => g.mediaIds)).not.toContain(uuid(6))
  })

  it('does not bring back a suggestion over one the user accepted', () => {
    const state = afterRun()
    state.segments = [
      ...state.segments,
      seg(47, {
        endsAt: S1.endsAt,
        kind: 'trip',
        origin: 'accepted',
        startsAt: S1.startsAt,
      }),
    ]
    const restore = planRestore(snapshot(), state)
    expect(restore.recreateSegments).toEqual([])
    expect(restore.skipped).toContainEqual({
      id: S1.id,
      reason: 'decided',
      target: 'segment',
    })
  })

  it('scales: indexes moves instead of scanning them per extension', () => {
    const n = 4000
    const many = Array.from({ length: n }, (_, i) => med(10_000 + i))
    const extensions = Array.from({ length: 200 }, (_, i) => mom(20_000 + i))
    const snap = buildOrganizeSnapshot(
      J,
      { media: many, moments: extensions, segments: [] },
      {
        ...plan,
        mediaReassignments: many.map((m, i) => ({
          mediaId: m.id,
          momentId: extensions[i % 200]?.id ?? '',
        })),
        momentsToCreate: [],
        momentsToDelete: [],
        momentsToExtend: extensions.map((m) => ({
          endsAt: m.endsAt,
          id: m.id,
          startsAt: m.startsAt,
        })),
        momentsToUpdate: [],
        segmentsToDelete: [],
        tripSuggestions: [],
      },
      META,
    )
    const started = performance.now()
    planRestore(snap, {
      media: many.map((m, i) => ({
        ...m,
        momentId: extensions[i % 200]?.id ?? null,
      })),
      moments: extensions,
      segments: [],
    })
    expect(performance.now() - started).toBeLessThan(1000)
  })
})
