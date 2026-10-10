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
    ...over,
  }
  return deps
}

describe('organizeJourney', () => {
  it('builds the plan from ready media only and applies in the safe order', async () => {
    const calls: string[] = []
    const result = await organizeJourney(J, makeDeps(calls))
    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      'createMoments:1',
      `assign:${uuid(701)}:2`,
      `assign:${uuid(701)}:1`,
      'deleteMoments:1',
      'deleteSegments:1',
    ])
    if (result.ok) {
      expect(result.counts).toMatchObject({
        mediaReassigned: 3,
        momentsCreated: 1,
        momentsDeleted: 1,
      })
    }
  })

  it('writes auto unlocked moments created by the signed-in user', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls)
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

  it('stops at the failing step and names it', async () => {
    const calls: string[] = []
    const deps = makeDeps(calls, {
      assignMedia: vi.fn(() => Promise.reject(new Error('boom'))),
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
})
