import { describe, expect, it } from 'vitest'
import {
  med,
  mom,
  seg,
  variant,
} from '@/features/journey-workspace/test-fixtures'
import { buildOverview } from '@/features/journey-workspace/model/workspace-overview'
import {
  CULL_MIN_PHOTOS,
  computeTasks,
  dayNeedsCulling,
} from '@/features/journey-workspace/model/workspace-tasks'
import { groupMomentsByDay } from '@/features/journey-workspace/model/workspace-days'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'

const T = (day: string, hhmm = '10:00') => `2026-01-${day}T${hhmm}:00+00:00`
const none = () => undefined

function photos(n0: number, count: number, momentId: string, over = {}) {
  return Array.from({ length: count }, (_, i) => {
    const base = med(n0 + i)
    return med(n0 + i, {
      capturedAt: T('02'),
      momentId,
      variants: [variant(base.id, 'thumb')],
      ...over,
    })
  })
}

describe('task bar counts', () => {
  it('counts suggestions, nested ones included, and points at the first', () => {
    const stage = seg(1, { origin: 'suggested' })
    const trip = seg(2, {
      kind: 'trip',
      origin: 'suggested',
      parentId: stage.id,
    })
    const manual = seg(3, { startsAt: T('20'), endsAt: T('25') })
    const tree = buildWorkspaceTree([manual, trip, stage], [], [])
    const { suggestions } = computeTasks(tree, [])
    expect(suggestions.count).toBe(2)
    expect(suggestions.firstSegmentId).toBe(stage.id)
    expect(
      computeTasks(buildWorkspaceTree([manual], [], []), []).suggestions,
    ).toEqual({ count: 0, firstSegmentId: null })
  })

  it('counts days without any text, moment or segment', () => {
    const stage = seg(1, { endsAt: T('04'), startsAt: T('01') })
    const moments = [
      mom(10, { body: 'text', startsAt: T('02') }),
      mom(11, { startsAt: T('03') }),
      mom(12, { startsAt: T('06') }),
    ]
    const tree = buildWorkspaceTree([stage], moments, [])
    const tasks = buildOverview(tree, none, 'Europe/Prague').tasks
    expect(tasks.daysWithoutText).toEqual({ count: 2, firstDay: '2026-01-03' })
    // The stage's own text covers its days; the loose day stays open.
    const written = buildWorkspaceTree(
      [{ ...stage, body: 'About the stage' }],
      moments,
      [],
    )
    expect(
      buildOverview(written, none, 'Europe/Prague').tasks.daysWithoutText,
    ).toEqual({ count: 1, firstDay: '2026-01-06' })
  })

  it('wants a best-of pass for days with 15+ photos and no star', () => {
    expect(CULL_MIN_PHOTOS).toBe(15)
    expect(dayNeedsCulling(14, false)).toBe(false)
    expect(dayNeedsCulling(15, false)).toBe(true)
    expect(dayNeedsCulling(40, true)).toBe(false)
    const a = mom(10)
    const b = mom(11, { startsAt: T('03') })
    const c = mom(12, { startsAt: T('04') })
    const media = [
      ...photos(100, 15, a.id),
      ...photos(200, 15, b.id, { starred: true }),
      ...photos(300, 14, c.id),
    ]
    const tree = buildWorkspaceTree([], [a, b, c], media)
    expect(
      computeTasks(tree, groupMomentsByDay(tree.looseMoments, 'Europe/Prague'))
        .daysToCull,
    ).toEqual({ count: 1, firstDay: '2026-01-02' })
  })

  it('counts media without a capture time, in moments and unassigned', () => {
    const a = mom(10)
    const media = [
      med(20, { capturedAt: null, momentId: a.id }),
      med(21, { capturedAt: null }),
      med(22, { capturedAt: null }),
      med(23, { momentId: a.id }),
    ]
    const tree = buildWorkspaceTree([], [a], media)
    const tasks = computeTasks(
      tree,
      groupMomentsByDay(tree.looseMoments, 'Europe/Prague'),
    )
    expect(tasks.mediaWithoutTime).toEqual({
      count: 3,
      firstDay: '2026-01-02',
      unassigned: true,
    })
  })

  it('counts a day note as text', () => {
    const moments = [
      mom(10, { startsAt: T('02') }),
      mom(11, { startsAt: T('03') }),
    ]
    const tree = buildWorkspaceTree([], moments, [])
    const days = groupMomentsByDay(tree.looseMoments, 'Europe/Prague')
    expect(computeTasks(tree, days).daysWithoutText.count).toBe(2)
    expect(
      computeTasks(tree, days, new Set(['2026-01-02'])).daysWithoutText,
    ).toEqual({ count: 1, firstDay: '2026-01-03' })
    const overview = buildOverview(
      tree,
      none,
      'Europe/Prague',
      new Set(['2026-01-03']),
    )
    expect(overview.chapters[0]?.days.map((d) => d.hasText)).toEqual([
      false,
      true,
    ])
    expect(overview.chapters[0]?.progress).toBe(0.5)
  })

  it('counts unreviewed media per day, per chapter and for the journey', () => {
    const stage = seg(1, { endsAt: T('04'), startsAt: T('01') })
    const moments = [
      mom(10, { startsAt: T('02') }),
      mom(11, { startsAt: T('03') }),
    ]
    const tree = buildWorkspaceTree([stage], moments, [
      ...photos(20, 2, moments[0]?.id ?? '', { reviewedAt: null }),
      // No reviewedAt at all (old cached data) counts as reviewed.
      ...photos(30, 3, moments[1]?.id ?? ''),
      med(40, { capturedAt: null, reviewedAt: null }),
    ])
    const overview = buildOverview(
      tree,
      none,
      'Europe/Prague',
      new Set(['2026-01-03']),
    )
    expect(overview.tasks.unreviewed.count).toBe(3)
    const chapter = overview.chapters[0]
    expect(chapter?.days.map((d) => d.status.unreviewed)).toEqual([2, 0])
    expect(chapter?.days.map((d) => d.status.overall)).toEqual([
      'notStarted',
      'done',
    ])
    expect(chapter).toMatchObject({ doneDays: 1, totalDays: 2 })
  })
})
