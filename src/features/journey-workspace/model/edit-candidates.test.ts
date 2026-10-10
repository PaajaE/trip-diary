import { describe, expect, it } from 'vitest'
import {
  adjacentSegmentPairs,
  boundaryCandidates,
  canSplit,
  findAdjacentMoments,
  splitCandidates,
} from '@/features/journey-workspace/model/edit-candidates'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg } from '@/features/journey-workspace/test-fixtures'

const T = (hhmm: string, day = '02') => `2026-01-${day}T${hhmm}:00+00:00`

function entryOf(
  media: ReturnType<typeof med>[],
  over: Parameters<typeof mom>[1] = {},
) {
  const moment = mom(10, {
    endsAt: T('12:00'),
    startsAt: T('10:00'),
    ...over,
  })
  const tree = buildWorkspaceTree(
    [seg(1)],
    [moment],
    media.map((m) => ({ ...m, momentId: moment.id })),
  )
  const entry = tree.roots[0]?.moments[0]
  if (entry === undefined) throw new Error('fixture')
  return entry
}

describe('splitCandidates', () => {
  it('is empty with 0 or 1 media', () => {
    expect(splitCandidates(entryOf([]))).toEqual([])
    expect(splitCandidates(entryOf([med(20)]))).toEqual([])
    expect(canSplit(entryOf([med(20)]))).toBe(false)
  })

  it('offers the gap between two media, counting both sides', () => {
    const entry = entryOf([
      med(21, { capturedAt: T('11:00') }),
      med(20, { capturedAt: T('10:30') }),
    ])
    const [only, ...rest] = splitCandidates(entry)
    expect(rest).toEqual([])
    expect(only).toMatchObject({ at: T('11:00'), keepCount: 1, moveCount: 1 })
  })

  it('skips equal timestamps and keeps untimed media on the original side', () => {
    const entry = entryOf([
      med(20, { capturedAt: T('10:30') }),
      med(21, { capturedAt: T('10:30') }),
      med(22, { capturedAt: T('11:00') }),
      med(23, { capturedAt: null }),
    ])
    const candidates = splitCandidates(entry)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      at: T('11:00'),
      keepCount: 3,
      moveCount: 1,
    })
  })

  it('needs two timed media even when untimed ones exist', () => {
    const entry = entryOf([
      med(20, { capturedAt: T('10:30') }),
      med(21, { capturedAt: null }),
    ])
    expect(splitCandidates(entry)).toEqual([])
  })

  it('drops instants the DB would reject (not after start / after end)', () => {
    const entry = entryOf(
      [
        med(20, { capturedAt: T('09:00') }),
        med(21, { capturedAt: T('10:00') }),
        med(22, { capturedAt: T('13:00') }),
      ],
      {},
    )
    // 10:00 equals starts_at (needs > start); 13:00 is after ends_at.
    expect(splitCandidates(entry)).toEqual([])
  })
})

describe('findAdjacentMoments', () => {
  it('returns neighbours in start order', () => {
    const tree = buildWorkspaceTree(
      [seg(1)],
      [
        mom(12, { startsAt: T('14:00'), endsAt: T('15:00') }),
        mom(10, { startsAt: T('10:00') }),
        mom(11, { startsAt: T('12:00'), endsAt: T('13:00') }),
      ],
      [],
    )
    const all = tree.roots[0]?.moments ?? []
    const mid = findAdjacentMoments(all, mom(11).id)
    expect(mid.previous?.moment.id).toBe(mom(10).id)
    expect(mid.next?.moment.id).toBe(mom(12).id)
    expect(findAdjacentMoments(all, mom(10).id).previous).toBeNull()
    expect(findAdjacentMoments(all, mom(12).id).next).toBeNull()
    expect(findAdjacentMoments(all, 'missing')).toEqual({
      next: null,
      previous: null,
    })
  })
})

describe('adjacentSegmentPairs', () => {
  it('pairs same-kind siblings that touch exactly', () => {
    const a = seg(1, { endsAt: T('00:00', '05'), startsAt: T('00:00', '01') })
    const b = seg(2, { endsAt: T('00:00', '09'), startsAt: T('00:00', '05') })
    const gap = seg(3, { endsAt: T('00:00', '20'), startsAt: T('00:00', '10') })
    const pairs = adjacentSegmentPairs(buildWorkspaceTree([a, b, gap], [], []))
    expect(pairs.map((p) => [p.before.segment.id, p.after.segment.id])).toEqual(
      [[a.id, b.id]],
    )
  })

  it('does not pair different kinds and pairs trips under the same parent', () => {
    const stage = seg(1, {
      endsAt: T('00:00', '20'),
      startsAt: T('00:00', '01'),
    })
    const t1 = seg(2, {
      endsAt: T('12:00', '05'),
      kind: 'trip',
      parentId: stage.id,
      startsAt: T('00:00', '04'),
      tripType: 'day',
    })
    const t2 = seg(3, {
      endsAt: T('00:00', '07'),
      kind: 'trip',
      parentId: stage.id,
      startsAt: T('12:00', '05'),
      tripType: 'day',
    })
    const tree = buildWorkspaceTree([stage, t1, t2], [], [])
    const pairs = adjacentSegmentPairs(tree)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.before.segment.id).toBe(t1.id)
    const other = seg(4, {
      endsAt: T('00:00', '30'),
      kind: 'trip',
      startsAt: T('00:00', '20'),
      tripType: 'day',
    })
    expect(
      adjacentSegmentPairs(buildWorkspaceTree([stage, other], [], [])),
    ).toEqual([])
  })
})

describe('boundaryCandidates', () => {
  const before = seg(1, {
    endsAt: T('00:00', '05'),
    startsAt: T('00:00', '01'),
  })
  const after = seg(2, { endsAt: T('00:00', '09'), startsAt: T('00:00', '05') })

  function entries(
    moments: ReturnType<typeof mom>[],
    media: ReturnType<typeof med>[] = [],
  ) {
    const tree = buildWorkspaceTree([before, after], moments, media)
    return [...tree.roots.flatMap((r) => r.moments)]
  }

  it('offers moment edges and media times strictly inside both segments', () => {
    const m = mom(10, { endsAt: T('11:00', '03'), startsAt: T('10:00', '03') })
    const c = boundaryCandidates(before, after, entries([m]), [
      med(30, { capturedAt: T('08:00', '07'), capturedTz: 'Europe/Prague' }),
      med(31, { capturedAt: T('00:00', '09') }), // = after.ends_at: not strictly inside
    ])
    expect(c.map((x) => x.at)).toEqual([
      T('10:00', '03'),
      T('11:00', '03'),
      T('08:00', '07'),
    ])
    expect(c[2]?.tz).toBe('Europe/Prague')
  })

  it('excludes the current boundary and instants strictly inside a moment', () => {
    const m = mom(10, { endsAt: T('12:00', '06'), startsAt: T('00:00', '05') })
    const inside = med(30, { capturedAt: T('06:00', '05'), momentId: m.id })
    const c = boundaryCandidates(before, after, entries([m], [inside]), [])
    // m starts exactly at the current boundary (excluded); 06:00 is inside m;
    // its end 12:00 on day 6 is the only valid edge.
    expect(c.map((x) => x.at)).toEqual([T('12:00', '06')])
  })

  it('merges equal instants from several sources into one candidate', () => {
    const m = mom(10, { endsAt: T('11:00', '03'), startsAt: T('10:00', '03') })
    const edge = med(30, { capturedAt: T('11:00', '03'), momentId: m.id })
    const c = boundaryCandidates(before, after, entries([m], [edge]), [])
    expect(c.map((x) => x.at)).toEqual([T('10:00', '03'), T('11:00', '03')])
  })

  it('ignores media without capture time and gives nothing for an empty journey', () => {
    expect(
      boundaryCandidates(before, after, [], [med(30, { capturedAt: null })]),
    ).toEqual([])
  })
})
