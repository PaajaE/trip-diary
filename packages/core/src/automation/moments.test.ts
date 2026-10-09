import { describe, expect, it } from 'vitest'
import { canadaV1Media } from './fixtures/canada-v1.ts'
import { findDuplicateGroups } from './duplicates.ts'
import type { MediaPoint } from './media-point.ts'
import { clusterMoments } from './moments.ts'

function photo(
  id: string,
  capturedAt: string | null,
  latitude: number | null = 51.0,
  longitude: number | null = -115.0,
): MediaPoint {
  return { capturedAt, id, latitude, longitude }
}

describe('clusterMoments', () => {
  it('splits on a long pause', () => {
    const { moments } = clusterMoments([
      photo('a', '2026-06-01T10:00:00Z'),
      photo('b', '2026-06-01T10:30:00Z'),
      photo('c', '2026-06-01T13:00:00Z'),
    ])

    expect(moments.map((moment) => moment.mediaIds)).toEqual([
      ['a', 'b'],
      ['c'],
    ])
  })

  it('splits on a jump in position even when photos are close in time', () => {
    const { moments } = clusterMoments([
      photo('a', '2026-06-01T10:00:00Z', 51.0, -115.0),
      // ~20 km further, 25 minutes later: a drive, not the same moment
      photo('b', '2026-06-01T10:25:00Z', 51.18, -115.0),
    ])

    expect(moments).toHaveLength(2)
  })

  it('keeps a continuous walk together while each step is short', () => {
    const walk = Array.from({ length: 10 }, (_, index) =>
      photo(
        `w${String(index)}`,
        `2026-06-01T10:${String(index * 5).padStart(2, '0')}:00Z`,
        51.0 + index * 0.008, // ~0.9 km per step, ~8 km in total
        -115.0,
      ),
    )

    expect(clusterMoments(walk).moments).toHaveLength(1)
  })

  it('places photos without coordinates by time only', () => {
    const { moments } = clusterMoments([
      photo('a', '2026-06-01T10:00:00Z'),
      photo('b', '2026-06-01T10:10:00Z', null, null),
      photo('c', '2026-06-01T10:20:00Z'),
    ])

    expect(moments[0]?.mediaIds).toEqual(['a', 'b', 'c'])
    expect(moments[0]?.centroid).toEqual({ latitude: 51.0, longitude: -115.0 })
  })

  it('reports undated media separately', () => {
    const result = clusterMoments([
      photo('a', '2026-06-01T10:00:00Z'),
      photo('b', null),
      photo('c', 'not a date'),
    ])

    expect(result.undatedMediaIds).toEqual(['b', 'c'])
    expect(result.moments).toHaveLength(1)
  })

  it('never regroups media of locked moments', () => {
    const { moments } = clusterMoments(
      [
        photo('a', '2026-06-01T10:00:00Z'),
        photo('b', '2026-06-01T10:05:00Z'),
        photo('c', '2026-06-01T10:10:00Z'),
      ],
      { lockedMediaIds: new Set(['b']) },
    )

    expect(moments.map((moment) => moment.mediaIds)).toEqual([['a', 'c']])
  })

  it('is deterministic regardless of input order', () => {
    const shuffled = [...canadaV1Media].reverse()

    expect(clusterMoments(shuffled)).toEqual(clusterMoments(canadaV1Media))
  })

  it('anchors each moment to its earliest media', () => {
    const { moments } = clusterMoments([
      photo('z', '2026-06-01T10:05:00Z'),
      photo('y', '2026-06-01T10:00:00Z'),
    ])

    expect(moments[0]?.anchorMediaId).toBe('y')
    expect(moments[0]?.startsAt).toBe('2026-06-01T10:00:00.000Z')
    expect(moments[0]?.endsAt).toBe('2026-06-01T10:05:00.000Z')
  })
})

describe('clusterMoments on the Canada sample', () => {
  const { moments } = clusterMoments(canadaV1Media)
  const momentOf = (id: string) =>
    moments.find((moment) => moment.mediaIds.includes(id))

  it('separates the layover abroad from arriving in Calgary', () => {
    expect(momentOf('p17')?.mediaIds).toEqual(['p17', 'p18'])
    expect(momentOf('p19')).not.toBe(momentOf('p17'))
  })

  it('keeps the Calgary downtown afternoon as one moment', () => {
    expect(momentOf('p19')?.mediaIds).toEqual([
      'p19',
      'p20',
      'p21',
      'p22',
      'p23',
      'p24',
    ])
  })

  it('splits the Yoho day where the v1 entries mixed several places', () => {
    // v1 "Yoho" covered two days and two valleys; time and distance split it.
    const yohoMoments = new Set(
      canadaV1Media
        .filter((media) => media.v1Entry === 'yoho')
        .map((media) => momentOf(media.id)?.anchorMediaId),
    )
    expect(yohoMoments.size).toBeGreaterThan(1)
  })

  it('assigns every dated photo exactly once', () => {
    const ids = moments.flatMap((moment) => moment.mediaIds)

    expect(ids).toHaveLength(canadaV1Media.length)
    expect(new Set(ids).size).toBe(canadaV1Media.length)
  })
})

describe('findDuplicateGroups', () => {
  it('finds photos imported twice into different entries', () => {
    const groups = findDuplicateGroups(canadaV1Media)

    expect(groups).toContainEqual(['p02', 'p25'])
    // one second apart: the same shot with rounded timestamps
    expect(groups).toContainEqual(['p09', 'p34'])
    expect(groups).toHaveLength(12)
  })

  it('does not group different photos taken at the same time elsewhere', () => {
    expect(
      findDuplicateGroups([
        photo('a', '2026-06-01T10:00:00Z', 51.0, -115.0),
        photo('b', '2026-06-01T10:00:00Z', 51.001, -115.0), // ~110 m away
      ]),
    ).toEqual([])
  })

  it('matches media without coordinates only with each other', () => {
    expect(
      findDuplicateGroups([
        photo('a', '2026-06-01T10:00:00Z', null, null),
        photo('b', '2026-06-01T10:00:00Z', null, null),
        photo('c', '2026-06-01T10:00:00Z'),
      ]),
    ).toEqual([['a', 'b']])
  })
})
