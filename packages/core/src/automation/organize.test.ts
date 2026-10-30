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
    kind: m.kind,
    latitude: m.latitude,
    locked: false,
    longitude: m.longitude,
    origin: 'auto',
    startsAt: m.startsAt,
  }))
  const updated = new Map(plan.momentsToUpdate.map((m) => [m.id, m]))
  const extended = new Map(plan.momentsToExtend.map((m) => [m.id, m]))
  const kept = input.moments
    .filter((m) => !dropped.has(m.id))
    .map((m): OrganizeMoment => {
      const update = updated.get(m.id)
      if (update !== undefined) {
        return {
          ...m,
          endsAt: update.endsAt,
          kind: update.kind,
          latitude: update.latitude,
          longitude: update.longitude,
          startsAt: update.startsAt,
        }
      }
      const extension = extended.get(m.id)
      return extension === undefined
        ? m
        : { ...m, endsAt: extension.endsAt, startsAt: extension.startsAt }
    })
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
    moments: [...kept, ...created],
    segments,
  }
}

/** Several well separated places, each visited for a few days. */
function smartLikeMedia(): OrganizeMedia[] {
  const places: (readonly [number, number])[] = [CANMORE, VANCOUVER, MORAINE]
  const media: OrganizeMedia[] = []
  places.forEach((place, p) => {
    for (let d = 0; d < 4; d += 1) {
      const date = new Date(Date.UTC(2026, 6, 1 + p * 5 + d))
        .toISOString()
        .slice(0, 10)
      media.push(
        photo(`s${String(p)}${String(d)}a`, `${date}T10:00:00Z`, place),
      )
      media.push(
        photo(`s${String(p)}${String(d)}b`, `${date}T18:00:00Z`, place),
      )
    }
  })
  return media
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

  it('suggests a stage boundary at the jump (04:00 local of the new zone) and trips per stage', () => {
    const plan = planOrganization(empty(journeyMedia()), options())
    // Day by the night: v1 (10:00Z = 03:00 PDT on 09-05) comes after a long
    // gap, so it opens 09-05 and the Vancouver stage starts with that photo.
    expect(plan.stageSuggestions.map((s) => s.startsAt)).toEqual([
      '2026-09-01T09:00:00.000Z',
      '2026-09-05T10:00:00.000Z',
    ])
    expect(plan.stageSuggestions[0]?.endsAt).toBe('2026-09-05T10:00:00.000Z')
    expect(plan.stageSuggestions[0]?.title).toBe('stage--1')
    expect(plan.tripSuggestions).toHaveLength(1)
    const trip = plan.tripSuggestions[0]
    expect(trip?.tripType).toBe('day')
    // 04:00 day rule: b1 (08:00Z = 02:00 MDT) belongs to the day 09-01, so
    // the 09-02 day trip starts with b2 instead.
    expect(trip?.startsAt).toBe('2026-09-02T12:00:00.000Z')
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
    // Stable id: x1 is still the oldest photo of old-auto's stop, so the
    // moment is kept (updated); x3 (next day) gets a stop of its own.
    expect(plan.momentsToDelete).toEqual(['empty-auto'])
    expect(plan.momentsToUpdate.map((m) => [m.id, m.mediaIds])).toEqual([
      ['old-auto', ['x1', 'x2']],
    ])
    expect(plan.momentsToCreate.map((m) => m.mediaIds)).toEqual([['x3']])
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
    // d1 is still the oldest photo: the moment keeps its id and takes d2 in;
    // u1/u2 never move.
    expect(moved.momentsToDelete).toEqual([])
    expect(moved.momentsToCreate).toEqual([])
    expect(moved.momentsToUpdate.map((m) => m.id)).toEqual(['auto-u'])
    expect(moved.mediaReassignments).toEqual([
      { mediaId: 'd2', momentId: 'auto-u' },
    ])
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
    // Day by the night: the Vancouver stage starts with its first photo.
    expect(plan.stageSuggestions.map((s) => s.startsAt)).toEqual([
      '2026-09-05T10:00:00.000Z',
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

  describe('titles and gaps', () => {
    function placed(): OrganizeInput {
      const media = journeyMedia().map((item) => ({
        ...item,
        momentId: item.id.startsWith('v') ? 'mv' : 'mc',
      }))
      const moment = (id: string, placeName: string): OrganizeMoment => ({
        endsAt: '2026-09-06T18:00:00Z',
        id,
        locked: false,
        origin: 'auto',
        placeKind: undefined,
        placeName,
        startsAt: '2026-09-01T09:00:00Z',
      })
      return {
        media,
        moments: [moment('mc', 'Canmore'), moment('mv', 'Vancouver')],
        segments: [],
      }
    }

    it('names suggestions from the places of their moments', () => {
      const plan = planOrganization(placed(), options())
      const titles = plan.stageSuggestions.map((s) => s.title)
      expect(titles.join('|')).toContain('Canmore')
      expect(titles.join('|')).toContain('Vancouver')
    })

    it('numbers fallback titles contiguously and never repeats a title', () => {
      const plan = planOrganization(empty(smartLikeMedia()), {
        ...options(),
        segmentTitle: () => 'Same',
      })
      const all = [...plan.stageSuggestions, ...plan.tripSuggestions]
      expect(new Set(all.map((s) => s.title)).size).toBe(all.length)

      const numbered = planOrganization(empty(smartLikeMedia()), options())
      const stageIndexes = numbered.stageSuggestions.map((s) =>
        Number(s.title.split('-').pop()),
      )
      expect(stageIndexes).toEqual(stageIndexes.map((_, i) => i + 1))
    })

    it('does not repeat the title of a manual or accepted segment', () => {
      const input = placed()
      const first = planOrganization(input, options())
      const taken = first.stageSuggestions[0]?.title ?? ''
      const plan = planOrganization(
        {
          ...input,
          segments: [
            {
              endsAt: '2020-01-01T00:00:00Z',
              id: 'manual',
              kind: 'stage',
              origin: 'manual',
              startsAt: '2020-01-01T00:00:00Z',
              title: taken,
              tripType: null,
            },
          ],
        },
        options(),
      )
      expect(plan.stageSuggestions.map((s) => s.title)).not.toContain(taken)
    })

    it('replaces an unchanged suggestion whose title is now better', () => {
      const input = placed()
      const plan = planOrganization(input, options())
      const stale = plan.stageSuggestions.map(
        (s): OrganizeSegment => ({
          endsAt: s.endsAt,
          id: `old-${s.id}`,
          kind: 'stage',
          origin: 'suggested',
          startsAt: s.startsAt,
          title: 'Etapa 1',
          tripType: null,
        }),
      )
      const again = planOrganization({ ...input, segments: stale }, options())
      expect(again.segmentsToDelete.sort()).toEqual(
        stale.map((s) => s.id).sort(),
      )
      expect(again.stageSuggestions).toHaveLength(stale.length)
    })

    it('uses another place of a trip when its name is already taken', () => {
      const trip = (id: string, day: string) => [
        photo(`${id}1`, `${day}T09:00:00Z`, CANMORE, `${id}a`),
        photo(`${id}2`, `${day}T12:00:00Z`, MORAINE, `${id}a`),
        photo(`${id}3`, `${day}T13:00:00Z`, MORAINE, `${id}b`),
        photo(`${id}4`, `${day}T17:00:00Z`, CANMORE, `${id}a`),
      ]
      const media = [
        ...trip('x', '2026-09-01'),
        photo('q', '2026-09-02T09:00:00Z', CANMORE, 'xa'),
        photo('r', '2026-09-02T17:00:00Z', CANMORE, 'xa'),
        ...trip('y', '2026-09-03'),
      ]
      const moment = (id: string, name: string): OrganizeMoment => ({
        endsAt: '2026-09-01T00:00:00Z',
        id,
        locked: false,
        origin: 'auto',
        placeKind: 'settlement',
        placeName: name,
        startsAt: '2026-09-01T00:00:00Z',
      })
      const plan = planOrganization(
        {
          media,
          moments: [
            moment('xa', 'Canmore'),
            moment('xb', 'Moraine'),
            moment('ya', 'Canmore'),
            moment('yb', 'Moraine'),
          ],
          segments: [],
        },
        options(),
      )
      const titles = plan.tripSuggestions.map((t) => t.title)
      expect(new Set(titles).size).toBe(titles.length)
    })

    it('does not cover a long photo gap with a stage', () => {
      const media = [
        photo('a1', '2026-09-01T09:00:00Z', CANMORE),
        photo('a2', '2026-09-02T09:00:00Z', CANMORE),
        photo('a3', '2026-09-03T09:00:00Z', CANMORE),
        photo('b1', '2026-09-20T09:00:00Z', VANCOUVER),
        photo('b2', '2026-09-21T09:00:00Z', VANCOUVER),
      ]
      const plan = planOrganization(empty(media), options())
      const [one, two] = plan.stageSuggestions
      expect(plan.stageSuggestions).toHaveLength(2)
      expect(one?.endsAt).toBe('2026-09-03T09:00:00.000Z')
      expect(Date.parse(two?.startsAt ?? '')).toBeGreaterThan(
        Date.parse('2026-09-19T00:00:00Z'),
      )
    })
  })

  describe('smart stages', () => {
    const BASE_A = [51.0, -115.5] as const
    const BASE_B = [49.5, -123.5] as const

    function at(
      [lat, lon]: readonly [number, number],
      northKm = 0,
    ): readonly [number, number] {
      return [lat + northKm / 111, lon]
    }

    /** 21 days: stay with day trips and a trek, a 3 day transfer, a second stay. */
    function smartMedia(): OrganizeMedia[] {
      const media: OrganizeMedia[] = []
      let dayIndex = 0
      const addDay = (points: (readonly [number, number])[]) => {
        const date = new Date(Date.UTC(2026, 6, 1 + dayIndex))
          .toISOString()
          .slice(0, 10)
        points.forEach((point, index) => {
          media.push(
            photo(
              `d${String(dayIndex).padStart(2, '0')}-${String(index)}`,
              `${date}T${String(17 + index * 2)}:00:00Z`,
              point,
            ),
          )
        })
        dayIndex += 1
      }
      for (const away of [0, 30, 0, 40, 25]) {
        addDay([
          at(BASE_A),
          ...(away > 0 ? [at(BASE_A, away)] : []),
          at(BASE_A),
        ])
      }
      for (let i = 0; i < 6; i += 1) {
        const north = 50 + 5 * (i < 3 ? i : 5 - i)
        addDay([at(BASE_A, north), at(BASE_A, north + 3)])
      }
      for (let i = 0; i < 3; i += 1) addDay([at(BASE_A), at(BASE_A)])
      for (let i = 0; i < 3; i += 1) {
        const p: readonly [number, number] = [
          BASE_A[0] + ((BASE_B[0] - BASE_A[0]) * (i + 1)) / 4,
          BASE_A[1] + ((BASE_B[1] - BASE_A[1]) * (i + 1)) / 4,
        ]
        addDay([p, p])
      }
      for (let i = 0; i < 4; i += 1) addDay([BASE_B, BASE_B])
      return media
    }

    function smartOptions(): OrganizeOptions {
      return {
        ...options(),
        segmentTitle: ({ index, kind, stageKind, tripType }) =>
          `${stageKind ?? tripType ?? kind}-${String(index)}`,
      }
    }

    it('cuts stays and a transfer with kinds, titles and trips', () => {
      const plan = planOrganization(empty(smartMedia()), smartOptions())
      expect(plan.stageSuggestions.map((s) => s.stageKind)).toEqual([
        'stay',
        'transfer',
        'stay',
      ])
      expect(plan.stageSuggestions.map((s) => s.title)).toEqual([
        'stay-1',
        'transfer-2',
        'stay-3',
      ])
      expect(plan.stageSuggestions.every((s) => s.reason !== undefined)).toBe(
        true,
      )
      expect(plan.stageSuggestions.every((s) => s.tripType === null)).toBe(true)
      expect(plan.tripSuggestions.map((s) => s.tripType)).toEqual([
        'day',
        'day',
        'day',
        'trek',
      ])
      // the stages tile the journey without gaps
      const [one, two, three] = plan.stageSuggestions
      expect(one?.endsAt).toBe(two?.startsAt)
      expect(two?.endsAt).toBe(three?.startsAt)
      expect(one?.startsAt).toBe('2026-07-01T17:00:00.000Z')
    })

    it('is idempotent and independent of input order', () => {
      const input = empty(smartMedia())
      const first = planOrganization(input, smartOptions())
      expect(
        planOrganization(empty(smartMedia().reverse()), smartOptions()),
      ).toEqual(first)
      const second = planOrganization(applyPlan(input, first), smartOptions())
      expect(second.stageSuggestions).toEqual([])
      expect(second.tripSuggestions).toEqual([])
      expect(second.segmentsToDelete).toEqual([])
      expect(isPlanEmpty(second)).toBe(true)
    })

    it('keeps manual stages and does not repeat a rejected boundary', () => {
      const base = planOrganization(empty(smartMedia()), smartOptions())
      const [, transfer, secondStay] = base.stageSuggestions
      const plan = planOrganization(
        {
          media: smartMedia(),
          moments: [],
          segments: [
            {
              endsAt: transfer?.endsAt ?? '',
              id: 'manual',
              kind: 'stage',
              origin: 'manual',
              startsAt: transfer?.startsAt ?? '',
              tripType: null,
            },
            {
              endsAt: secondStay?.endsAt ?? '',
              id: 'rejected',
              kind: 'stage',
              origin: 'rejected',
              startsAt: secondStay?.startsAt ?? '',
              tripType: null,
            },
          ],
        },
        smartOptions(),
      )
      expect(plan.stageSuggestions.map((s) => s.stageKind)).toEqual(['stay'])
      expect(plan.segmentsToDelete).toEqual([])
    })
  })
})

/** A morning walk of 12 photos, 12 min apart and 800 m, on Sep 1st. */
function trekMedia(owner = 'anna', extra: Partial<OrganizeMedia> = {}) {
  return Array.from(
    { length: 12 },
    (_, i): OrganizeMedia => ({
      ...photo(
        `t${String(i).padStart(2, '0')}`,
        new Date(Date.UTC(2026, 8, 1, 8, i * 12)).toISOString(),
        [51.089, -115.358 + (i * 800) / 69_900],
      ),
      ownerId: owner,
      ...extra,
    }),
  )
}

describe('planOrganization ZS-4', () => {
  it('plans moments with a kind and a reason', () => {
    const plan = planOrganization(empty(journeyMedia()), options())
    expect(plan.momentsToCreate.length).toBeGreaterThan(0)
    for (const moment of plan.momentsToCreate) {
      expect(['stay', 'point', 'en_route']).toContain(moment.kind)
      expect(moment.reason).not.toBe('')
    }
  })

  it('suggests an in-day trip as a trip segment and collapses its photos', () => {
    const plan = planOrganization(empty(trekMedia()), options())
    expect(plan.momentsToCreate).toHaveLength(1)
    expect(plan.momentsToCreate[0]?.kind).toBe('en_route')
    const trips = plan.tripSuggestions
    expect(trips).toHaveLength(1)
    expect(trips[0]?.tripType).toBe('trek')
    expect(trips[0]?.reason).toMatch(/trip/)
    // sub-day: the segment lasts hours, not days
    const hours =
      (Date.parse(trips[0]?.endsAt ?? '') -
        Date.parse(trips[0]?.startsAt ?? '')) /
      3_600_000
    expect(hours).toBeGreaterThan(1.5)
    expect(hours).toBeLessThan(24)
  })

  it('is idempotent with kinds: planning on its own result is empty', () => {
    const input = empty(trekMedia())
    const plan = planOrganization(input, options())
    const next = applyPlan(input, plan)
    const again = planOrganization(next, options(counterIds('again')))
    expect(isPlanEmpty(again)).toBe(true)
  })

  it('updates the kind of an auto moment whose stored kind no longer fits (stable id)', () => {
    const input = empty(trekMedia())
    const plan = planOrganization(input, options())
    const next = applyPlan(input, plan)
    const stale: OrganizeInput = {
      ...next,
      moments: next.moments.map((moment) => ({ ...moment, kind: 'stay' })),
    }
    const again = planOrganization(stale, options(counterIds('again')))
    expect(again.momentsToCreate).toEqual([])
    expect(again.momentsToDelete).toEqual([])
    expect(again.momentsToUpdate.length).toBeGreaterThan(0)
    expect(again.momentsToUpdate.map((m) => [m.id, m.kind])).toEqual(
      next.moments
        .filter((m) => plan.momentsToCreate.some((p) => p.id === m.id))
        .map((m) => [
          m.id,
          plan.momentsToCreate.find((p) => p.id === m.id)?.kind,
        ])
        .filter(([, kind]) => kind !== 'stay'),
    )
    const settled = applyPlan(stale, again)
    expect(
      isPlanEmpty(planOrganization(settled, options(counterIds('third')))),
    ).toBe(true)
  })

  it('does not suggest an in-day trip again over a rejected one', () => {
    const first = planOrganization(empty(trekMedia()), options())
    const trip = first.tripSuggestions[0]
    expect(trip).toBeDefined()
    const rejected: OrganizeSegment = {
      endsAt: trip?.endsAt ?? '',
      id: 'r1',
      kind: 'trip',
      origin: 'rejected',
      startsAt: trip?.startsAt ?? '',
      tripType: 'trek',
    }
    const plan = planOrganization(
      { ...empty(trekMedia()), segments: [rejected] },
      options(),
    )
    expect(plan.tripSuggestions).toEqual([])
  })

  it('keeps locked moments untouched and still sees their time for trips', () => {
    const media = trekMedia().map((item, i) =>
      i < 3 ? { ...item, momentId: 'locked-1' } : item,
    )
    const plan = planOrganization(
      {
        media,
        moments: [
          {
            endsAt: '2026-09-01T08:30:00.000Z',
            id: 'locked-1',
            kind: 'stay',
            locked: true,
            origin: 'manual',
            startsAt: '2026-09-01T08:00:00.000Z',
          },
        ],
        segments: [],
      },
      options(),
    )
    const planned = plan.momentsToCreate.flatMap((m) => m.mediaIds)
    expect(planned).not.toContain('t00')
    expect(plan.momentsToDelete).not.toContain('locked-1')
    expect(plan.tripSuggestions.map((t) => t.tripType)).toEqual(['trek'])
  })

  it('keeps photos at a natural place as stops, not as filler of the trek', () => {
    const media = trekMedia('anna', { placeKind: 'natural' })
    const plan = planOrganization(empty(media), options())
    expect(plan.momentsToCreate.every((m) => m.kind !== 'en_route')).toBe(true)
  })

  /** 12 photos 10 min apart on a 130 km drive. */
  function driveMedia(momentId: string | null): OrganizeMedia[] {
    return Array.from(
      { length: 12 },
      (_, i): OrganizeMedia => ({
        ...photo(
          `d${String(i).padStart(2, '0')}`,
          new Date(Date.UTC(2026, 8, 1, 8, i * 10)).toISOString(),
          [51.089, -115.358 + (i * 11_000) / 69_900],
          momentId,
        ),
        ownerId: 'anna',
      }),
    )
  }

  it('does not let the place of an old auto moment change the result', () => {
    const kindsFor = (place: Partial<OrganizeMoment>) => {
      const plan = planOrganization(
        {
          media: driveMedia('old'),
          moments: [
            {
              endsAt: '2026-09-01T10:00:00.000Z',
              id: 'old',
              kind: 'stay',
              locked: false,
              origin: 'auto',
              startsAt: '2026-09-01T08:00:00.000Z',
              ...place,
            },
          ],
          segments: [],
        },
        options(),
      )
      return [...plan.momentsToCreate, ...plan.momentsToUpdate].map(
        (m) => `${m.kind}:${String(m.mediaIds.length)}`,
      )
    }
    const without = kindsFor({})
    expect(without).toEqual(['en_route:12'])
    expect(kindsFor({ placeKind: 'settlement', placeName: 'Banff' })).toEqual(
      without,
    )
  })

  it('stays empty after apply even when the new moments get a place later', () => {
    const input = empty(driveMedia(null))
    const plan = planOrganization(input, options())
    const next = applyPlan(input, plan)
    const geocoded: OrganizeInput = {
      ...next,
      moments: next.moments.map((moment) => ({
        ...moment,
        placeKind: 'settlement',
        placeName: 'Banff',
      })),
    }
    expect(
      isPlanEmpty(planOrganization(geocoded, options(counterIds('again')))),
    ).toBe(true)
  })

  it('never recreates an unlocked auto moment that carries user content', () => {
    const edits: Partial<OrganizeMoment>[] = [
      { title: 'Our lake' },
      { body: 'We swam.' },
      { coverMediaId: 'd01' },
      { published: false },
    ]
    for (const edit of edits) {
      const media = driveMedia('mine')
      const plan = planOrganization(
        {
          media,
          moments: [
            {
              endsAt: '2026-09-01T10:00:00.000Z',
              id: 'mine',
              kind: 'stay',
              locked: false,
              origin: 'auto',
              startsAt: '2026-09-01T08:00:00.000Z',
              ...edit,
            },
          ],
          segments: [],
        },
        options(),
      )
      expect(plan.momentsToDelete, JSON.stringify(edit)).toEqual([])
      expect(plan.momentsToCreate, JSON.stringify(edit)).toEqual([])
      expect(plan.mediaReassignments, JSON.stringify(edit)).toEqual([])
    }
    // empty strings and the default published flag are not user content
    const plain = planOrganization(
      {
        media: driveMedia('plain'),
        moments: [
          {
            body: '',
            coverMediaId: null,
            endsAt: '2026-09-01T10:00:00.000Z',
            id: 'plain',
            kind: 'stay',
            locked: false,
            origin: 'auto',
            published: true,
            startsAt: '2026-09-01T08:00:00.000Z',
            title: null,
          },
        ],
        segments: [],
      },
      options(),
    )
    // stable id: it is updated (kind), not recreated
    expect(plain.momentsToDelete).toEqual([])
    expect(plain.momentsToUpdate.map((m) => [m.id, m.kind])).toEqual([
      ['plain', 'en_route'],
    ])
  })

  it('does not merge in-day trips of different types or chain overlaps', () => {
    const walk = trekMedia('anna')
    const ride = Array.from(
      { length: 8 },
      (_, i): OrganizeMedia => ({
        ...photo(
          `r${String(i)}`,
          new Date(Date.UTC(2026, 8, 1, 9, i * 15)).toISOString(),
          [51.2, -115.358 + (i * 5000) / 69_900],
        ),
        ownerId: 'bob',
      }),
    )
    const plan = planOrganization(empty([...walk, ...ride]), options())
    expect(plan.tripSuggestions.map((t) => t.tripType).sort()).toEqual([
      'day',
      'trek',
    ])
  })

  it('numbers an in-day trip by its local day', () => {
    const titles: string[] = []
    planOrganization(empty(trekMedia()), {
      ...options(),
      homeTz: 'Pacific/Auckland',
      segmentTitle: (input) => {
        titles.push(`${input.startsOn}:${String(input.inDay)}`)
        return 'x'
      },
    })
    // The photos are in Alberta: 08:00 UTC is 02:00 local on Sep 1st, before
    // the 04:00 fallback, so the trip is numbered by Aug 31st there (not by
    // the home zone, Auckland, where it would be Sep 1st).
    expect(titles.some((t) => t === '2026-08-31:true')).toBe(true)
  })

  it('plans two authors walking the same trek with one shared trip', () => {
    const input = empty([
      ...trekMedia('anna'),
      ...trekMedia('bob').map((m) => ({
        ...m,
        id: `b-${m.id}`,
        ownerId: 'bob',
      })),
    ])
    const plan = planOrganization(input, options())
    const owners = new Set(
      plan.momentsToCreate.map((moment) => moment.mediaIds[0]?.[0]),
    )
    expect(owners.size).toBeGreaterThanOrEqual(1)
    expect(plan.tripSuggestions).toHaveLength(1)
  })
})
