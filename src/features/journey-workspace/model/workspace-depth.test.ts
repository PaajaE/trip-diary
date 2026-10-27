import { describe, expect, it } from 'vitest'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'
import {
  depthChrome,
  withoutStageLevel,
  workspaceDepth,
} from '@/features/journey-workspace/model/workspace-depth'
import { buildOverview } from '@/features/journey-workspace/model/workspace-overview'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

const day = (d: number) =>
  `2026-06-${String(d).padStart(2, '0')}T10:00:00+00:00`

/** One stop with one photo on each listed day of June. */
function journey(days: number[], segments = [] as ReturnType<typeof seg>[]) {
  const moments = days.map((d) =>
    mom(100 + d, { endsAt: day(d), startsAt: day(d) }),
  )
  const media = days.map((d) =>
    med(200 + d, {
      capturedAt: day(d),
      capturedTz: 'UTC',
      momentId: uuid(100 + d),
    }),
  )
  return buildWorkspaceTree(segments, moments, media, 'UTC')
}

const suggestedStages = [
  seg(1, {
    endsAt: '2026-06-05T00:00:00+00:00',
    origin: 'suggested',
    startsAt: '2026-06-01T00:00:00+00:00',
  }),
  seg(2, {
    endsAt: '2026-06-09T00:00:00+00:00',
    origin: 'suggested',
    startsAt: '2026-06-05T00:00:00+00:00',
  }),
]

describe('workspace depth (ZS-6)', () => {
  it('hides suggested stages on a week holiday (days -> stops)', () => {
    const tree = journey([1, 2, 6, 7], suggestedStages)
    const overview = buildOverview(tree, () => undefined, 'UTC')
    expect(overview.depth.size).toBe('short')
    expect(overview.depth.stageMode).toBe('none')
    expect(overview.chapters.map((c) => c.kind)).toEqual(['loose'])
    expect(overview.tasks.suggestions.count).toBe(0)
    expect(depthChrome(overview.depth)).toEqual({
      showDays: true,
      showNav: true,
      showStages: false,
    })
  })

  it('shows stops only for a one-day journey', () => {
    const overview = buildOverview(journey([3]), () => undefined, 'UTC')
    expect(overview.depth.levels).toEqual(['stops'])
    expect(depthChrome(overview.depth)).toEqual({
      showDays: false,
      showNav: false,
      showStages: false,
    })
  })

  it('always shows stages the user made', () => {
    const tree = journey(
      [1, 2],
      [seg(3, { endsAt: day(3), origin: 'manual', startsAt: day(1) })],
    )
    const overview = buildOverview(tree, () => undefined, 'UTC')
    expect(overview.depth.stageMode).toBe('primary')
    expect(overview.chapters.map((c) => c.kind)).toEqual(['stage'])
    expect(depthChrome(overview.depth).showStages).toBe(true)
  })

  it('offers two clear suggested stages on a longer trip', () => {
    const days = [1, 4, 8, 12, 16, 20]
    const stages = [
      seg(1, {
        endsAt: '2026-06-10T00:00:00+00:00',
        origin: 'suggested',
        startsAt: '2026-06-01T00:00:00+00:00',
      }),
      seg(2, {
        endsAt: '2026-06-21T00:00:00+00:00',
        origin: 'suggested',
        startsAt: '2026-06-10T00:00:00+00:00',
      }),
    ]
    const overview = buildOverview(
      journey(days, stages),
      () => undefined,
      'UTC',
    )
    expect(overview.depth.size).toBe('long')
    expect(overview.depth.stageMode).toBe('suggestion')
    expect(overview.chapters.filter((c) => c.kind === 'stage')).toHaveLength(2)
  })

  it('dissolves suggested stages but keeps their trips as chapters', () => {
    const trip = seg(5, {
      endsAt: day(2),
      kind: 'trip',
      origin: 'suggested',
      parentId: uuid(1),
      startsAt: day(2),
      tripType: 'walk',
    })
    const tree = journey([1, 2], [suggestedStages[0] ?? seg(1), trip])
    const flat = withoutStageLevel(tree)
    expect(flat.roots.map((r) => r.segment.id)).toEqual([uuid(5)])
    expect(flat.looseMoments.map((m) => m.moment.id)).toEqual([uuid(101)])
    expect(withoutStageLevel(flat)).toBe(flat)
    expect(workspaceDepth(tree, ['2026-06-01', 'unknown']).spanDays).toBe(1)
  })

  it('counts photo days of photos not in a stop yet', () => {
    // One stop on 1 June, unplaced photos on 30 June: a long trip, not a day.
    const tree = buildWorkspaceTree(
      [],
      [mom(101, { endsAt: day(1), startsAt: day(1) })],
      [
        med(201, {
          capturedAt: day(1),
          capturedTz: 'UTC',
          momentId: uuid(101),
        }),
        med(202, { capturedAt: day(30), capturedTz: 'UTC', momentId: null }),
      ],
      'UTC',
    )
    const overview = buildOverview(tree, () => undefined, 'UTC')
    expect(overview.depth.spanDays).toBe(30)
    expect(overview.depth.size).toBe('long')
  })
})
