import { describe, expect, it } from 'vitest'
import {
  isPlanEmpty,
  planOrganization,
  type OrganizeInput,
  type OrganizeMedia,
  type OrganizeMoment,
} from '../organize.ts'
import {
  applyPlan,
  harnessOptions,
  intakeInvariants,
  laterUpload,
} from './intake.ts'
import { buildExtraScenarios, buildScenarios } from './scenarios.ts'

const P = [50.087, 14.421] as const
/** ~2 km east of P. */
const FAR = [50.087, 14.449] as const
const MIN = 60_000

function at(base: string, minutes: number): string {
  // Formats a synthetic instant, no clock is read.
  return new Date(Date.parse(base) + minutes * MIN).toISOString()
}

function media(
  id: string,
  capturedAt: string,
  place: readonly [number, number] | null = P,
  momentId: string | null = null,
  extra: Partial<OrganizeMedia> = {},
): OrganizeMedia {
  return {
    capturedAt,
    id,
    latitude: place?.[0] ?? null,
    longitude: place?.[1] ?? null,
    momentId,
    ownerId: 'anna',
    ...extra,
  }
}

const BASE = '2026-07-10T10:00:00.000Z'

/** A confirmed stop at P, 10:00-10:40 UTC, three photos. */
function confirmed(over: Partial<OrganizeMoment> = {}): OrganizeMoment {
  return {
    endsAt: at(BASE, 40),
    id: 'L',
    kind: 'stay',
    locked: true,
    origin: 'manual',
    startsAt: BASE,
    title: 'Our stop',
    ...over,
  }
}

function withLocked(
  extra: OrganizeMedia[],
  moment: OrganizeMoment = confirmed(),
): OrganizeInput {
  const start = Date.parse(moment.startsAt)
  const end = Date.parse(moment.endsAt)
  const mid = new Date((start + end) / 2).toISOString()
  return {
    media: [
      media('l1', moment.startsAt, P, moment.id),
      media('l2', mid, P, moment.id),
      media('l3', moment.endsAt, P, moment.id),
      ...extra,
    ],
    moments: [moment],
    segments: [],
  }
}

describe('ZS-5 intake into confirmed stops', () => {
  it('extends a confirmed stop by a new photo within 2 h of its edge', () => {
    const input = withLocked([media('n1', at(BASE, 40 + 90))])
    const plan = planOrganization(input, harnessOptions())
    expect(plan.momentsToExtend).toEqual([
      expect.objectContaining({
        endsAt: at(BASE, 130),
        id: 'L',
        mediaIds: ['n1'],
        startsAt: BASE,
      }),
    ])
    expect(plan.mediaReassignments).toEqual([{ mediaId: 'n1', momentId: 'L' }])
    expect(plan.momentsToCreate).toEqual([])
    expect(intakeInvariants(input, harnessOptions()).violations).toEqual([])
  })

  it('extends at the start edge too', () => {
    const input = withLocked([media('n0', at(BASE, -100))])
    const plan = planOrganization(input, harnessOptions())
    expect(plan.momentsToExtend[0]?.startsAt).toBe(at(BASE, -100))
    expect(plan.momentsToExtend[0]?.endsAt).toBe(at(BASE, 40))
  })

  it('does not extend beyond the window; the photo forms its own stop', () => {
    const input = withLocked([media('n1', at(BASE, 40 + 121))])
    const plan = planOrganization(input, harnessOptions())
    expect(plan.momentsToExtend).toEqual([])
    expect(plan.momentsToCreate.map((m) => m.mediaIds)).toEqual([['n1']])
  })

  it('honours a custom window', () => {
    const input = withLocked([media('n1', at(BASE, 40 + 50))])
    expect(
      planOrganization(
        input,
        harnessOptions('UTC', { intakeWindowMs: 30 * MIN }),
      ).momentsToExtend,
    ).toEqual([])
    expect(
      planOrganization(
        input,
        harnessOptions('UTC', { intakeWindowMs: 60 * MIN }),
      ).momentsToExtend,
    ).toHaveLength(1)
  })

  it('never extends across the 04:00 local day boundary', () => {
    // Prague (UTC+2 in July): the stop ends 03:30 local, the photo at 04:30
    // local is 60 min later at the same place but on the next day.
    const stop = confirmed({
      endsAt: '2026-07-10T01:30:00.000Z',
      startsAt: '2026-07-10T01:00:00.000Z',
    })
    const late = withLocked([media('n1', '2026-07-10T02:30:00.000Z')], stop)
    const options = harnessOptions('Europe/Prague')
    expect(planOrganization(late, options).momentsToExtend).toEqual([])
    // ... and backwards: a stop starting at 04:30 local does not take in a
    // photo from 03:30 local (the previous day).
    const early = withLocked(
      [media('n0', '2026-07-10T01:30:00.000Z')],
      confirmed({
        endsAt: '2026-07-10T03:00:00.000Z',
        startsAt: '2026-07-10T02:30:00.000Z',
      }),
    )
    expect(planOrganization(early, options).momentsToExtend).toEqual([])
    // the same gap inside one day does extend
    const sameDay = withLocked(
      [media('n1', '2026-07-10T08:30:00.000Z')],
      confirmed({
        endsAt: '2026-07-10T07:30:00.000Z',
        startsAt: '2026-07-10T07:00:00.000Z',
      }),
    )
    expect(planOrganization(sameDay, options).momentsToExtend).toHaveLength(1)
  })

  it('needs the place to fit: a photo 2 km away does not join', () => {
    const input = withLocked([media('n1', at(BASE, 50), FAR)])
    expect(planOrganization(input, harnessOptions()).momentsToExtend).toEqual(
      [],
    )
    // not even inside the stored range (someone else elsewhere)
    const inside = withLocked([media('n2', at(BASE, 20), FAR)])
    expect(planOrganization(inside, harnessOptions()).momentsToExtend).toEqual(
      [],
    )
  })

  it('takes in a photo without GPS only inside the stored range', () => {
    const inside = withLocked([media('n1', at(BASE, 20), null)])
    expect(
      planOrganization(inside, harnessOptions()).momentsToExtend[0]?.mediaIds,
    ).toEqual(['n1'])
    const outside = withLocked([media('n2', at(BASE, 60), null)])
    expect(planOrganization(outside, harnessOptions()).momentsToExtend).toEqual(
      [],
    )
  })

  it('moves a Live Photo clip with its still', () => {
    const input = withLocked([
      media('n1', at(BASE, 60)),
      media('n1-clip', at(BASE, 60), P, null, {
        kind: 'video',
        livePhotoOf: 'n1',
      }),
    ])
    const plan = planOrganization(input, harnessOptions())
    expect(plan.momentsToExtend[0]?.mediaIds).toEqual(['n1', 'n1-clip'])
  })

  it('never takes photos from another moment and never grows an en route stop', () => {
    const route = withLocked(
      [media('n1', at(BASE, 50))],
      confirmed({ kind: 'en_route' }),
    )
    expect(planOrganization(route, harnessOptions()).momentsToExtend).toEqual(
      [],
    )
    const auto: OrganizeInput = {
      ...withLocked([media('a1', at(BASE, 50), P, 'A')]),
      moments: [
        confirmed(),
        {
          endsAt: at(BASE, 50),
          id: 'A',
          kind: 'point',
          locked: false,
          origin: 'auto',
          startsAt: at(BASE, 50),
        },
      ],
    }
    expect(planOrganization(auto, harnessOptions()).momentsToExtend).toEqual([])
  })

  it('leaves the confirmed stop untouched otherwise and is idempotent', () => {
    const input = withLocked([
      media('n1', at(BASE, 70)),
      media('n2', at(BASE, 300)),
    ])
    const options = harnessOptions()
    const result = intakeInvariants(input, options)
    expect(result.violations).toEqual([])
    const plan = planOrganization(input, options)
    expect(plan.momentsToExtend.map((m) => m.mediaIds)).toEqual([['n1']])
    const next = applyPlan(input, plan)
    const stored = next.moments.find((m) => m.id === 'L')
    expect(stored).toMatchObject({
      locked: true,
      origin: 'manual',
      title: 'Our stop',
    })
    expect(isPlanEmpty(planOrganization(next, harnessOptions('UTC')))).toBe(
      true,
    )
  })
})

describe('ZS-5 stable stop ids', () => {
  it('keeps the id of an unlocked stop whose oldest photo is unchanged', () => {
    const first: OrganizeInput = {
      media: [
        media('a1', at(BASE, 0)),
        media('a2', at(BASE, 10)),
        media('a3', at(BASE, 20)),
      ],
      moments: [],
      segments: [],
    }
    const plan = planOrganization(first, harnessOptions())
    const id = plan.momentsToCreate[0]?.id
    expect(id).toBeDefined()
    const stored = applyPlan(first, plan)
    const more: OrganizeInput = {
      ...stored,
      media: [
        ...stored.media,
        media('a4', at(BASE, 30)),
        media('a5', at(BASE, 40)),
      ],
    }
    const again = planOrganization(more, harnessOptions())
    expect(again.momentsToCreate).toEqual([])
    expect(again.momentsToDelete).toEqual([])
    expect(again.momentsToUpdate.map((m) => [m.id, m.mediaIds])).toEqual([
      [id, ['a1', 'a2', 'a3', 'a4', 'a5']],
    ])
    expect(again.mediaReassignments.map((r) => r.mediaId)).toEqual(['a4', 'a5'])
    const settled = applyPlan(more, again)
    expect(isPlanEmpty(planOrganization(settled, harnessOptions()))).toBe(true)
  })

  it('gives a new id when an older photo now anchors the stop', () => {
    const first: OrganizeInput = {
      media: [media('a1', at(BASE, 10)), media('a2', at(BASE, 20))],
      moments: [],
      segments: [],
    }
    const stored = applyPlan(first, planOrganization(first, harnessOptions()))
    const oldId = stored.moments[0]?.id
    const more = {
      ...stored,
      media: [...stored.media, media('a0', at(BASE, 0))],
    }
    const again = planOrganization(more, harnessOptions('UTC'))
    expect(again.momentsToCreate.map((m) => m.mediaIds)).toEqual([
      ['a0', 'a1', 'a2'],
    ])
    expect(again.momentsToDelete).toEqual([oldId])
  })
})

describe('ZS-5 intake properties over the harness scenarios', () => {
  const scenarios = [...buildScenarios(), ...buildExtraScenarios()]
  for (const zone of ['UTC', 'Europe/Prague']) {
    it(`a later upload into confirmed stops keeps every invariant (${zone})`, () => {
      const failing: string[] = []
      const grew: string[] = []
      for (const scenario of scenarios) {
        const input = laterUpload(scenario.points, zone)
        const result = intakeInvariants(input, harnessOptions(zone))
        if (!result.holds) {
          failing.push(`${scenario.id}: ${result.violations.join(', ')}`)
        }
        const plan = planOrganization(input, harnessOptions(zone))
        if (plan.momentsToExtend.length > 0) grew.push(scenario.id)
      }
      expect(failing).toEqual([])
      // not vacuous: the split point falls inside a stop in many scenarios
      console.info(
        `[harness] intake grew a confirmed stop in ${grew.join(',')}`,
      )
      expect(grew.length).toBeGreaterThan(5)
    })
  }

  it('a later upload into unlocked stops keeps the anchored ids', () => {
    for (const scenario of scenarios) {
      const input: OrganizeInput = {
        media: scenario.points.map((point) => ({
          capturedAt: point.capturedAt,
          id: point.id,
          latitude: point.latitude,
          longitude: point.longitude,
          momentId: null,
          ownerId: point.author,
        })),
        moments: [],
        segments: [],
      }
      const stored = applyPlan(input, planOrganization(input, harnessOptions()))
      // Re-planning the same photos changes nothing (idempotence).
      expect(
        isPlanEmpty(planOrganization(stored, harnessOptions())),
        scenario.id,
      ).toBe(true)
    }
  })
})
