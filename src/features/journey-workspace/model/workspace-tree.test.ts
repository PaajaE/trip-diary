import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceTree,
  collectMoments,
  isWorkspaceEmpty,
} from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

describe('buildWorkspaceTree', () => {
  it('handles empty inputs', () => {
    const tree = buildWorkspaceTree([], [], [])
    expect(tree).toEqual({ looseMoments: [], roots: [], unassigned: [] })
    expect(isWorkspaceEmpty(tree)).toBe(true)
  })

  it('nests trips by parent_id and orders by start time', () => {
    const stage = seg(1)
    const late = seg(3, {
      kind: 'trip',
      parentId: stage.id,
      startsAt: '2026-01-05T00:00:00+00:00',
    })
    const early = seg(2, {
      kind: 'trip',
      parentId: stage.id,
      startsAt: '2026-01-02T00:00:00+00:00',
    })
    const tree = buildWorkspaceTree([late, stage, early], [], [])
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]?.children.map((c) => c.segment.id)).toEqual([
      early.id,
      late.id,
    ])
  })

  it('nests a parentless trip by time containment under the tightest stage', () => {
    const wide = seg(1)
    const narrow = seg(2, {
      endsAt: '2026-01-06T00:00:00+00:00',
      startsAt: '2026-01-02T00:00:00+00:00',
    })
    const trip = seg(3, {
      endsAt: '2026-01-04T00:00:00+00:00',
      kind: 'trip',
      startsAt: '2026-01-03T00:00:00+00:00',
    })
    const tree = buildWorkspaceTree([wide, narrow, trip], [], [])
    const narrowNode = tree.roots.find((r) => r.segment.id === narrow.id)
    expect(narrowNode?.children[0]?.segment.id).toBe(trip.id)
  })

  it('makes a trip with a missing parent and no containing stage a root', () => {
    const trip = seg(2, {
      kind: 'trip',
      parentId: uuid(777),
      startsAt: '2027-05-01T00:00:00+00:00',
      endsAt: '2027-05-02T00:00:00+00:00',
    })
    const tree = buildWorkspaceTree([seg(1), trip], [], [])
    expect(tree.roots.map((r) => r.segment.id)).toContain(trip.id)
  })

  it('breaks parent cycles instead of dropping segments', () => {
    const a = seg(1, { kind: 'trip', parentId: uuid(2) })
    const b = seg(2, { kind: 'trip', parentId: uuid(1) })
    const tree = buildWorkspaceTree([a, b], [], [])
    const ids: string[] = []
    const walk = (n: (typeof tree.roots)[number]) => {
      ids.push(n.segment.id)
      n.children.forEach(walk)
    }
    tree.roots.forEach(walk)
    expect(ids.sort()).toEqual([a.id, b.id].sort())
  })

  it('assigns moments to the tightest trip, media by moment_id, counts roll up', () => {
    const stage = seg(1)
    const trip = seg(2, {
      endsAt: '2026-01-03T00:00:00+00:00',
      kind: 'trip',
      parentId: stage.id,
      startsAt: '2026-01-02T00:00:00+00:00',
    })
    const m = mom(10)
    const photo = med(20, { momentId: m.id })
    const video = med(21, {
      capturedAt: '2026-01-02T10:05:00+00:00',
      kind: 'video',
      momentId: m.id,
    })
    const tree = buildWorkspaceTree([stage, trip], [m], [video, photo])
    const stageNode = tree.roots[0]
    const tripNode = stageNode?.children[0]
    expect(stageNode?.moments).toHaveLength(0)
    expect(tripNode?.moments[0]?.media.map((x) => x.id)).toEqual([
      photo.id,
      video.id,
    ])
    expect(stageNode?.photoCount).toBe(1)
    expect(stageNode?.videoCount).toBe(1)
    expect(tripNode?.cover?.id).toBe(photo.id)
    expect(tripNode?.moments[0]?.tz).toBe('Europe/Prague')
  })

  it('puts orphan media and media of unknown moments in unassigned', () => {
    const orphan = med(1)
    const dangling = med(2, { momentId: uuid(555) })
    const tree = buildWorkspaceTree([], [], [dangling, orphan])
    expect(tree.unassigned.map((x) => x.id)).toEqual([orphan.id, dangling.id])
    expect(isWorkspaceEmpty(tree)).toBe(false)
  })

  it('keeps moments outside every segment as loose and falls back to segment tz', () => {
    const stage = seg(1, { tz: 'Asia/Tokyo' })
    const inside = mom(10)
    const outside = mom(11, {
      startsAt: '2030-01-01T00:00:00+00:00',
      endsAt: '2030-01-01T01:00:00+00:00',
    })
    const tree = buildWorkspaceTree([stage], [outside, inside], [])
    expect(tree.looseMoments.map((x) => x.moment.id)).toEqual([outside.id])
    expect(tree.roots[0]?.moments[0]?.tz).toBe('Asia/Tokyo')
    expect(collectMoments(tree).map((x) => x.moment.id)).toEqual([
      inside.id,
      outside.id,
    ])
  })
})
