import { describe, expect, it } from 'vitest'
import {
  isPlanEmpty,
  planOrganization,
  type OrganizationPlan,
  type OrganizeInput,
  type OrganizeMedia,
  type OrganizeMoment,
  type OrganizeOptions,
  type OrganizeSegment,
} from './organize.ts'

const CANMORE = [51.089, -115.358] as const
const MORAINE = [51.322, -116.186] as const
const VANCOUVER = [49.283, -123.121] as const

function counterIds(prefix = 'new') {
  let n = 0
  return () => {
    n += 1
    return `${prefix}-${String(n)}`
  }
}

function options(newId = counterIds()): OrganizeOptions {
  return {
    homeTz: 'UTC',
    newId,
    segmentTitle: ({ index, kind, tripType }) =>
      `${kind}-${tripType ?? ''}-${String(index)}`,
  }
}

function photo(
  id: string,
  capturedAt: string | null,
  [latitude, longitude]: readonly [number, number] | readonly [null, null] = [
    null,
    null,
  ],
  momentId: string | null = null,
): OrganizeMedia {
  return { capturedAt, id, latitude, longitude, momentId }
}

/** Two Canmore days with a day trip, then a jump to Vancouver for two days. */
function journeyMedia(): OrganizeMedia[] {
  return [
    photo('a1', '2026-09-01T09:00:00Z', CANMORE),
    photo('a2', '2026-09-01T09:20:00Z', CANMORE),
    photo('a3', '2026-09-01T17:00:00Z', CANMORE),
    photo('b1', '2026-09-02T08:00:00Z', CANMORE),
    photo('b2', '2026-09-02T12:00:00Z', MORAINE),
    photo('b3', '2026-09-02T17:00:00Z', CANMORE),
    photo('c1', '2026-09-03T10:00:00Z', CANMORE),
    photo('c2', '2026-09-03T17:00:00Z', CANMORE),
    photo('v1', '2026-09-05T10:00:00Z', VANCOUVER),
    photo('v2', '2026-09-05T18:00:00Z', VANCOUVER),
    photo('v3', '2026-09-06T10:00:00Z', VANCOUVER),
    photo('v4', '2026-09-06T18:00:00Z', VANCOUVER),
  ]
}

function empty(media: OrganizeMedia[]): OrganizeInput {
  return { media, moments: [], segments: [] }
}

/** Applies a plan to the input the way the app does, for idempotence checks. */
function applyPlan(
  input: OrganizeInput,
  plan: OrganizationPlan,
): OrganizeInput {
  const assigned = new Map(
    plan.mediaReassignments.map((r) => [r.mediaId, r.momentId]),
  )
  const dropped = new Set(plan.momentsToDelete)
  const created: OrganizeMoment[] = plan.momentsToCreate.map((m) => ({
    endsAt: m.endsAt,
    id: m.id,
    locked: false,
    origin: 'auto',
    startsAt: m.startsAt,
  }))
  const droppedSegments = new Set(plan.segmentsToDelete)
  const segments: OrganizeSegment[] = [
    ...input.segments.filter((s) => !droppedSegments.has(s.id)),
    ...[...plan.stageSuggestions, ...plan.tripSuggestions].map(
      (s): OrganizeSegment => ({
        endsAt: s.endsAt,
        id: s.id,
        kind: s.kind,
        origin: 'suggested',
        startsAt: s.startsAt,
        tripType: s.tripType,
      }),
    ),
  ]
  return {
    media: input.media.map((item) => ({
      ...item,
      momentId: assigned.get(item.id) ?? item.momentId,
    })),
    moments: [...input.moments.filter((m) => !dropped.has(m.id)), ...created],
    segments,
  }
}

describe('planOrganization', () => {
  it('creates moments with range, centroid and members from clusters', () => {
    const plan = planOrganization(empty(journeyMedia()), options())
    const first = plan.momentsToCreate[0]
    expect(first?.mediaIds).toEqual(['a1', 'a2'])
    expect(first?.startsAt).toBe('2026-09-01T09:00:00.000Z')
    expect(first?.endsAt).toBe('2026-09-01T09:20:00.000Z')
    expect(first?.latitude).toBeCloseTo(51.089)
    expect(plan.mediaReassignments).toHaveLength(12)
    expect(plan.mediaReassignments[0]).toEqual({
      mediaId: 'a1',
      momentId: first?.id,
    })
    expect(plan.momentsToDelete).toEqual([])
  })

  it('is deterministic with injected ids', () => {
    const one = planOrganization(empty(journeyMedia()), options())
    const two = planOrganization(empty(journeyMedia().reverse()), options())
    expect(two).toEqual(one)
    expect(one.momentsToCreate[0]?.id).toBe('new-1')
  })

  it('suggests a stage boundary at the jump and trips per stage', () => {
    const plan = planOrganization(empty(journeyMedia()), options())
    expect(plan.stageSuggestions.map((s) => s.startsAt)).toEqual([
      '2026-09-01T09:00:00.000Z',
      '2026-09-05T00:00:00.000Z',
    ])
    expect(plan.stageSuggestions[0]?.endsAt).toBe('2026-09-05T00:00:00.000Z')
    expect(plan.stageSuggestions[0]?.title).toBe('stage--1')
    expect(plan.tripSuggestions).toHaveLength(1)
    const trip = plan.tripSuggestions[0]
    expect(trip?.tripType).toBe('day')
    expect(trip?.startsAt).toBe('2026-09-02T08:00:00.000Z')
    expect(trip?.endsAt).toBe('2026-09-02T17:00:00.000Z')
  })

  it('leaves media of locked and manual moments alone', () => {
    const media = journeyMedia().map((item) =>
      item.id === 'a1' || item.id === 'a2'
        ? { ...item, momentId: 'locked-1' }
        : item.id === 'b1'
          ? { ...item, momentId: 'manual-1' }
          : item,
    )
    const input: OrganizeInput = {
      media,
      moments: [
        {
          endsAt: '2026-09-01T09:20:00Z',
          id: 'locked-1',
          locked: true,
          origin: 'auto',
          startsAt: '2026-09-01T09:00:00Z',
        },
        {
          endsAt: '2026-09-02T08:00:00Z',
          id: 'manual-1',
          locked: false,
          origin: 'manual',
          startsAt: '2026-09-02T08:00:00Z',
        },
      ],
      segments: [],
    }
    const plan = planOrganization(input, options())
    const touched = plan.mediaReassignments.map((r) => r.mediaId)
    expect(touched).not.toContain('a1')
    expect(touched).not.toContain('a2')
    expect(touched).not.toContain('b1')
    expect(plan.momentsToDelete).toEqual([])
    expect(plan.momentsToCreate.flatMap((m) => m.mediaIds)).not.toContain('a1')
  })

  it('deletes only auto unlocked moments that lost their media', () => {
    const media = [
      photo('x1', '2026-09-01T09:00:00Z', CANMORE, 'old-auto'),
      photo('x2', '2026-09-01T09:10:00Z', CANMORE, 'old-auto'),
      photo('x3', '2026-09-02T09:10:00Z', CANMORE, 'old-auto'),
      photo('y1', '2026-09-03T09:00:00Z', CANMORE, 'locked'),
    ]
    const plan = planOrganization(
      {
        media,
        moments: [
          {
            endsAt: '2026-09-01T09:05:00Z',
            id: 'old-auto',
            locked: false,
            origin: 'auto',
            startsAt: '2026-09-01T09:00:00Z',
          },
          {
            endsAt: '2026-09-03T09:00:00Z',
            id: 'locked',
            locked: true,
            origin: 'auto',
            startsAt: '2026-09-03T09:00:00Z',
          },
          {
            endsAt: '2026-09-04T09:00:00Z',
            id: 'empty-auto',
            locked: false,
            origin: 'auto',
            startsAt: '2026-09-04T09:00:00Z',
          },
        ],
        segments: [],
      },
      options(),
    )
    expect(plan.momentsToDelete.sort()).toEqual(['empty-auto', 'old-auto'])
    expect(plan.momentsToCreate).toHaveLength(2)
  })

  it('leaves media without capture time untouched and keeps their moment', () => {
    const media = [
      photo('u1', null, CANMORE, 'auto-u'),
      photo('d1', '2026-09-01T09:00:00Z', CANMORE, 'auto-u'),
      photo('u2', null),
    ]
    const plan = planOrganization(
      {
        media,
        moments: [
          {
            endsAt: '2026-09-01T09:00:00Z',
            id: 'auto-u',
            locked: false,
            origin: 'auto',
            startsAt: '2026-09-01T09:00:00Z',
          },
        ],
        segments: [],
      },
      options(),
    )
    // d1 alone is exactly the group of the existing moment: nothing to do.
    expect(plan.mediaReassignments).toEqual([])
    expect(plan.momentsToCreate).toEqual([])
    expect(plan.momentsToDelete).toEqual([])

    const moved = planOrganization(
      {
        media: [...media, photo('d2', '2026-09-01T09:05:00Z', CANMORE)],
        moments: [
          {
            endsAt: '2026-09-01T09:00:00Z',
            id: 'auto-u',
            locked: false,
            origin: 'auto',
            startsAt: '2026-09-01T09:00:00Z',
          },
        ],
        segments: [],
      },
      options(),
    )
    // The moment still holds undated u1, so it is kept; u1/u2 never move.
    expect(moved.momentsToDelete).toEqual([])
    expect(moved.mediaReassignments.map((r) => r.mediaId)).toEqual(['d1', 'd2'])
  })

  it('is idempotent: planning on its own result gives an empty plan', () => {
    const input = empty(journeyMedia())
    const first = planOrganization(input, options())
    expect(isPlanEmpty(first)).toBe(false)
    const second = planOrganization(applyPlan(input, first), options())
    expect(isPlanEmpty(second)).toBe(true)
  })

  it('replaces old suggested segments but keeps manual and accepted ones', () => {
    const input: OrganizeInput = {
      media: journeyMedia(),
      moments: [],
      segments: [
        {
          endsAt: '2026-09-02T00:00:00Z',
          id: 'old-suggested',
          kind: 'stage',
          origin: 'suggested',
          startsAt: '2026-09-01T00:00:00Z',
          tripType: null,
        },
        {
          endsAt: '2026-09-04T00:00:00Z',
          id: 'manual-stage',
          kind: 'stage',
          origin: 'manual',
          startsAt: '2026-09-01T00:00:00Z',
          tripType: null,
        },
        {
          endsAt: '2026-09-02T18:00:00Z',
          id: 'accepted-trip',
          kind: 'trip',
          origin: 'accepted',
          startsAt: '2026-09-02T06:00:00Z',
          tripType: 'day',
        },
      ],
    }
    const plan = planOrganization(input, options())
    expect(plan.segmentsToDelete).toEqual(['old-suggested'])
    // The manual stage covers the first stage region; the day trip is covered
    // by an accepted trip, so only the Vancouver stage remains suggested.
    expect(plan.stageSuggestions.map((s) => s.startsAt)).toEqual([
      '2026-09-05T00:00:00.000Z',
    ])
    expect(plan.tripSuggestions).toEqual([])
    expect(plan.segmentsToDelete).not.toContain('manual-stage')
    expect(plan.segmentsToDelete).not.toContain('accepted-trip')
  })

  it('does not suggest again what overlaps a rejected segment', () => {
    const input: OrganizeInput = {
      media: journeyMedia(),
      moments: [],
      segments: [
        {
          endsAt: '2026-09-07T00:00:00Z',
          id: 'rej-stage',
          kind: 'stage',
          origin: 'rejected',
          startsAt: '2026-09-05T00:00:00Z',
          tripType: null,
        },
        {
          endsAt: '2026-09-02T20:00:00Z',
          id: 'rej-trip',
          kind: 'trip',
          origin: 'rejected',
          startsAt: '2026-09-02T07:00:00Z',
          tripType: 'day',
        },
      ],
    }
    const plan = planOrganization(input, options())
    expect(plan.stageSuggestions.map((s) => s.startsAt)).toEqual([
      '2026-09-01T09:00:00.000Z',
    ])
    expect(plan.tripSuggestions).toEqual([])
    expect(plan.segmentsToDelete).toEqual([])
  })

  it('a rejected trip of another type does not block a suggestion', () => {
    const plan = planOrganization(
      {
        media: journeyMedia(),
        moments: [],
        segments: [
          {
            endsAt: '2026-09-02T20:00:00Z',
            id: 'rej',
            kind: 'trip',
            origin: 'rejected',
            startsAt: '2026-09-02T07:00:00Z',
            tripType: 'trek',
          },
        ],
      },
      options(),
    )
    expect(plan.tripSuggestions).toHaveLength(1)
  })

  it('replaces changed suggestions and drops the stale ones', () => {
    const input: OrganizeInput = {
      media: journeyMedia(),
      moments: [],
      segments: [
        {
          endsAt: '2026-09-03T00:00:00Z',
          id: 'stale',
          kind: 'trip',
          origin: 'suggested',
          startsAt: '2026-09-02T00:00:00Z',
          tripType: 'trek',
        },
      ],
    }
    const plan = planOrganization(input, options())
    expect(plan.segmentsToDelete).toEqual(['stale'])
    expect(plan.tripSuggestions).toHaveLength(1)
  })

  it('returns an empty plan for a journey without media', () => {
    expect(isPlanEmpty(planOrganization(empty([]), options()))).toBe(true)
  })
})
