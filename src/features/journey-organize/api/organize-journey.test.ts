import { describe, expect, it, vi } from 'vitest'
import {
  applyOrganizationPlan,
  organizeJourney,
  previewOrganization,
  type OrganizeDeps,
} from '@/features/journey-organize/api/organize-journey'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

const J = uuid(999)
const USER = uuid(500)

function makeDeps(calls: string[], over: Partial<OrganizeDeps> = {}) {
  let n = 0
  const deps: Partial<OrganizeDeps> = {
    assignMedia: vi.fn((ids: string[], momentId: string) => {
      calls.push(`assign:${momentId}:${String(ids.length)}`)
      return Promise.resolve()
    }),
    chunkSize: 2,
    createMoments: vi.fn((rows) => {
      calls.push(`createMoments:${String(rows.length)}`)
      return Promise.resolve()
    }),
    createSegments: vi.fn((rows) => {
      calls.push(`createSegments:${String(rows.length)}`)
      return Promise.resolve()
    }),
    deleteMoments: vi.fn((ids: string[]) => {
      calls.push(`deleteMoments:${String(ids.length)}`)
      return Promise.resolve()
    }),
    deleteSegments: vi.fn((ids: string[]) => {
      calls.push(`deleteSegments:${String(ids.length)}`)
      return Promise.resolve()
    }),
    getHomeTz: vi.fn(() => Promise.resolve('UTC')),
    getUserId: vi.fn(() => Promise.resolve(USER)),
    listMedia: vi.fn(() =>
      Promise.resolve([
        med(1, {
          capturedAt: '2026-09-01T09:00:00+00:00',
          latitude: 51.1,
          longitude: -115.3,
          momentId: uuid(31),
        }),
        med(2, {
          capturedAt: '2026-09-01T09:10:00+00:00',
          latitude: 51.1,
          longitude: -115.3,
        }),
        med(3, {
          capturedAt: '2026-09-01T09:20:00+00:00',
          latitude: 51.1,
          longitude: -115.3,
        }),
        med(4, { capturedAt: '2026-09-02T09:20:00+00:00', status: 'failed' }),
        med(5, { capturedAt: null }),
      ]),
    ),
    listMoments: vi.fn(() =>
      Promise.resolve([
        mom(31, {
          endsAt: '2026-09-01T09:00:00+00:00',
          startsAt: '2026-09-01T09:00:00+00:00',
        }),
      ]),
    ),
    listSegments: vi.fn(() =>
      Promise.resolve([
        seg(41, {
          endsAt: '2026-09-02T00:00:00+00:00',
          origin: 'suggested',
          startsAt: '2026-09-01T00:00:00+00:00',
        }),
      ]),
    ),
    newId: () => {
      n += 1
      return uuid(700 + n)
    },
    updateMoment: vi.fn((id: string, patch: object) => {
      calls.push(`updateMoment:${id}:${Object.keys(patch).sort().join(',')}`)
      return Promise.resolve(mom(31))
    }),
    ...over,
  }
  return deps
}

/** The fixture media with photo 1 outside any moment: moment 31 is emptied. */
function looseMedia(calls: string[]) {
  const base = makeDeps(calls).listMedia
  return vi.fn(async (journeyId: string) =>
    (await (base ?? (() => Promise.resolve([])))(journeyId)).map((item) =>
      item.id === uuid(1) ? { ...item, momentId: null } : item,
    ),
  )
}

describe('organizeJourney', () => {
  it('builds the plan from ready media only and applies in the safe order', async () => {
    const calls: string[] = []
    const result = await organizeJourney(J, makeDeps(calls))
    expect(result.ok).toBe(true)
    // Stable id: photo 1 (the oldest) already anchors moment 31, so the
    // moment keeps its id, grows to the new range and takes photos 2 and 3.
    // Media move first, the range is written after them.
    expect(calls).toEqual([
      `assign:${uuid(31)}:2`,
      `updateMoment:${uuid(31)}:endsAt,kind,latitude,longitude,startsAt`,
      'deleteSegments:1',
      // a single-stage journey now also gets its (typed) stage suggestion
      'createSegments:1',
    ])
    if (result.ok) {
      expect(result.counts).toMatchObject({
        mediaReassigned: 2,
        momentsCreated: 0,
        momentsDeleted: 0,
        momentsUpdated: 1,
      })
    }
  })

  it('writes auto unlocked moments created by the signed-in user', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, { listMedia: looseMedia(calls) })
    await organizeJourney(J, deps)
    expect(deps.createMoments).toHaveBeenCalledWith([
      expect.objectContaining({
        createdBy: USER,
        journeyId: J,
        locked: false,
        origin: 'auto',
      }),
    ])
  })

  it('writes the kind of the planned moment and maps the media facts', async () => {
    const calls: string[] = []
    // Two authors, one photo each at the same place: parallel owners are
    // passed on to the detection, the moment is a plain stay/point.
    const deps = makeDeps(calls, {
      listMedia: vi.fn(() =>
        Promise.resolve([
          med(1, {
            capturedAt: '2026-09-01T09:00:00+00:00',
            device: 'Apple iPhone 15',
            latitude: 51.1,
            longitude: -115.3,
            ownerId: uuid(501),
          }),
          med(2, {
            capturedAt: '2026-09-01T09:02:00+00:00',
            device: 'Apple iPhone 14',
            latitude: 51.1,
            longitude: -115.3,
            ownerId: uuid(502),
          }),
        ]),
      ),
      listMoments: vi.fn(() => Promise.resolve([])),
      listSegments: vi.fn(() => Promise.resolve([])),
    })
    const plan = await previewOrganization(J, deps)
    expect(plan.momentsToCreate).toHaveLength(1)
    expect(plan.momentsToCreate[0]).toMatchObject({ kind: 'point' })
    expect(plan.momentsToCreate[0]?.reason).toMatch(/parallel streams/)
    await organizeJourney(J, deps)
    expect(deps.createMoments).toHaveBeenCalledWith([
      expect.objectContaining({ kind: 'point' }),
    ])
  })

  it('stops at the failing step and names it', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      assignMedia: vi.fn(() => Promise.reject(new Error('boom'))),
      listMedia: looseMedia(calls),
    })
    const result = await organizeJourney(J, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.step).toBe('assignMedia')
      expect(result.counts.momentsCreated).toBe(1)
      expect(result.counts.mediaReassigned).toBe(0)
    }
    expect(deps.deleteMoments).not.toHaveBeenCalled()
    expect(deps.deleteSegments).not.toHaveBeenCalled()
    expect(deps.createSegments).not.toHaveBeenCalled()
  })

  it('grows a confirmed stop by range only and moves the new photo into it', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      listMedia: vi.fn(() =>
        Promise.resolve([
          med(1, {
            capturedAt: '2026-09-01T09:00:00+00:00',
            latitude: 51.1,
            longitude: -115.3,
            momentId: uuid(31),
          }),
          med(2, {
            capturedAt: '2026-09-01T10:00:00+00:00',
            latitude: 51.1,
            longitude: -115.3,
          }),
        ]),
      ),
      listMoments: vi.fn(() =>
        Promise.resolve([
          mom(31, {
            endsAt: '2026-09-01T09:00:00+00:00',
            locked: true,
            origin: 'manual',
            startsAt: '2026-09-01T09:00:00+00:00',
            title: 'Our stop',
          }),
        ]),
      ),
      listSegments: vi.fn(() => Promise.resolve([])),
    })
    const result = await organizeJourney(J, deps)
    expect(result.ok).toBe(true)
    expect(deps.updateMoment).toHaveBeenCalledWith(uuid(31), {
      endsAt: '2026-09-01T10:00:00.000Z',
      startsAt: '2026-09-01T09:00:00.000Z',
    })
    expect(calls.filter((c) => c.startsWith('assign'))).toEqual([
      `assign:${uuid(31)}:1`,
    ])
    expect(deps.createMoments).not.toHaveBeenCalled()
    expect(deps.deleteMoments).not.toHaveBeenCalled()
    if (result.ok) expect(result.counts.momentsExtended).toBe(1)
  })

  it('writes the grown range only after the photos moved; a failure leaves the range alone', async () => {
    const confirmedDeps = (over: Partial<OrganizeDeps>) => {
      const calls: string[] = []
      return {
        calls,
        deps: makeDeps(calls, {
          listMedia: vi.fn(() =>
            Promise.resolve([
              med(1, {
                capturedAt: '2026-09-01T09:00:00+00:00',
                latitude: 51.1,
                longitude: -115.3,
                momentId: uuid(31),
              }),
              med(2, {
                capturedAt: '2026-09-01T10:00:00+00:00',
                latitude: 51.1,
                longitude: -115.3,
              }),
            ]),
          ),
          listMoments: vi.fn(() =>
            Promise.resolve([
              mom(31, {
                endsAt: '2026-09-01T09:00:00+00:00',
                locked: true,
                origin: 'manual',
                startsAt: '2026-09-01T09:00:00+00:00',
              }),
            ]),
          ),
          listSegments: vi.fn(() => Promise.resolve([])),
          ...over,
        }),
      }
    }
    const ok = confirmedDeps({})
    await organizeJourney(J, ok.deps)
    expect(ok.calls.slice(0, 2)).toEqual([
      `assign:${uuid(31)}:1`,
      `updateMoment:${uuid(31)}:endsAt,startsAt`,
    ])
    // assign fails: no range was written
    const failAssign = confirmedDeps({
      assignMedia: vi.fn(() => Promise.reject(new Error('x'))),
    })
    const first = await organizeJourney(J, failAssign.deps)
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.error.step).toBe('assignMedia')
    expect(failAssign.deps.updateMoment).not.toHaveBeenCalled()
    // range write fails after the move: reported as its own step
    const failRange = confirmedDeps({
      updateMoment: vi.fn(() => Promise.reject(new Error('x'))),
    })
    const second = await organizeJourney(J, failRange.deps)
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error.step).toBe('updateMoments')
      expect(second.counts.mediaReassigned).toBe(1)
      expect(second.counts.momentsExtended).toBe(0)
    }
    expect(failRange.deps.deleteMoments).not.toHaveBeenCalled()
  })

  it('clears the place of a kept stop that moved far', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      listMedia: vi.fn(() =>
        Promise.resolve([
          med(1, {
            capturedAt: '2026-09-01T09:00:00+00:00',
            latitude: 51.2,
            longitude: -115.3,
            momentId: uuid(31),
          }),
        ]),
      ),
      listMoments: vi.fn(() =>
        Promise.resolve([
          mom(31, {
            endsAt: '2026-09-01T09:00:00+00:00',
            latitude: 51.1, // ~11 km away from its photo now
            longitude: -115.3,
            placeId: uuid(77),
            startsAt: '2026-09-01T09:00:00+00:00',
          }),
        ]),
      ),
      listSegments: vi.fn(() => Promise.resolve([])),
    })
    await organizeJourney(J, deps)
    expect(deps.updateMoment).toHaveBeenCalledWith(
      uuid(31),
      expect.objectContaining({ latitude: 51.2, placeId: null }),
    )
  })

  it('reports a load failure as step load without writing', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      listMoments: vi.fn(() => Promise.reject(new Error('down'))),
    })
    const result = await organizeJourney(J, deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.step).toBe('load')
    expect(calls).toEqual([])
  })

  it('does nothing for an up-to-date journey', async () => {
    const calls: string[] = []
    const result = await organizeJourney(
      J,
      makeDeps(calls, {
        listMedia: vi.fn(() => Promise.resolve([])),
        listMoments: vi.fn(() => Promise.resolve([])),
        listSegments: vi.fn(() => Promise.resolve([])),
      }),
    )
    expect(result.ok).toBe(true)
    expect(calls).toEqual([])
  })

  it('applies segments after the old ones are removed and reports progress', async () => {
    const calls: string[] = []
    const progress: string[] = []
    const deps = makeDeps(calls, {
      listMedia: looseMedia(calls),
      onProgress: (p) => {
        progress.push(`${p.step}:${String(p.done)}/${String(p.total)}`)
      },
    })
    const plan = await previewOrganization(J, deps)
    const withSegments = {
      ...plan,
      stageSuggestions: [
        {
          endsAt: '2026-09-05T00:00:00.000Z',
          id: uuid(801),
          kind: 'stage' as const,
          position: 0,
          startsAt: '2026-09-01T09:00:00.000Z',
          title: 'Stage 1',
          tripType: null,
        },
      ],
      tripSuggestions: [
        {
          endsAt: '2026-09-02T17:00:00.000Z',
          id: uuid(802),
          kind: 'trip' as const,
          position: 0,
          startsAt: '2026-09-02T08:00:00.000Z',
          title: 'Trip 1',
          tripType: 'day' as const,
        },
      ],
    }
    const result = await applyOrganizationPlan(J, withSegments, deps)
    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      'createMoments:1',
      `assign:${uuid(701)}:2`,
      `assign:${uuid(701)}:1`,
      'deleteMoments:1',
      'deleteSegments:1',
      'createSegments:1',
      'createSegments:1',
    ])
    expect(deps.createSegments).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ kind: 'stage', origin: 'suggested' }),
    ])
    expect(progress.at(-1)).toBe('createSegments:8/8')

    const failing = await applyOrganizationPlan(J, withSegments, {
      ...deps,
      createSegments: vi.fn(() => Promise.reject(new Error('x'))),
    })
    expect(failing.ok).toBe(false)
    if (!failing.ok) expect(failing.error.step).toBe('createSegments')
  })

  it('with the planned-on state, moves a photo only if it is still there', async () => {
    const plan = {
      mediaReassignments: [
        { mediaId: uuid(1), momentId: uuid(701) },
        { mediaId: uuid(2), momentId: uuid(701) },
      ],
      momentsToCreate: [],
      momentsToDelete: [],
      momentsToExtend: [],
      momentsToUpdate: [],
      segmentsToDelete: [],
      stageSuggestions: [],
      tripSuggestions: [],
    }
    const moveIfUnchanged = vi.fn(
      (ids: readonly string[], _to: string | null, from: string | null) =>
        // The user moved photo 2 meanwhile: only photo 1 is still at `from`.
        Promise.resolve(
          from === uuid(31) ? ids.filter((id) => id === uuid(1)) : [],
        ),
    )
    const assignMedia = vi.fn(() => Promise.resolve())
    const result = await applyOrganizationPlan(
      J,
      plan,
      {
        assignMedia,
        chunkSize: 10,
        getUserId: () => Promise.resolve(USER),
        moveIfUnchanged,
      },
      new Map([
        [uuid(1), uuid(31)],
        [uuid(2), uuid(31)],
      ]),
    )
    expect(assignMedia).not.toHaveBeenCalled()
    expect(moveIfUnchanged).toHaveBeenCalledWith(
      [uuid(1), uuid(2)],
      uuid(701),
      uuid(31),
    )
    expect(result.counts.mediaReassigned).toBe(1)
  })
})
