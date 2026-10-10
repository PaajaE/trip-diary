import { describe, expect, it } from 'vitest'
import { buildCoverTargetIndex } from '@/features/journey-workspace/model/cover-targets'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom, seg, uuid } from '@/features/journey-workspace/test-fixtures'

const JOURNEY = uuid(999)

describe('buildCoverTargetIndex', () => {
  it('lists moment, trip, stage and journey for nested media', () => {
    const stage = seg(1)
    const trip = seg(2, { kind: 'trip', parentId: stage.id })
    const moment = mom(10)
    const photo = med(20, { momentId: moment.id })
    const tree = buildWorkspaceTree([stage, trip], [moment], [photo])
    const targets = buildCoverTargetIndex(tree, JOURNEY, null).get(photo.id)
    expect(targets?.map((t) => [t.level, t.targetId])).toEqual([
      ['moment', moment.id],
      ['trip', trip.id],
      ['stage', stage.id],
      ['journey', JOURNEY],
    ])
  })

  it('omits trip when the moment sits directly in a stage', () => {
    const stage = seg(1)
    const moment = mom(10)
    const photo = med(20, { momentId: moment.id })
    const tree = buildWorkspaceTree([stage], [moment], [photo])
    const levels = buildCoverTargetIndex(tree, JOURNEY, null)
      .get(photo.id)
      ?.map((t) => t.level)
    expect(levels).toEqual(['moment', 'stage', 'journey'])
  })

  it('offers moment + journey for media of a loose moment', () => {
    const moment = mom(10)
    const photo = med(20, { momentId: moment.id })
    const tree = buildWorkspaceTree([], [moment], [photo])
    const levels = buildCoverTargetIndex(tree, JOURNEY, null)
      .get(photo.id)
      ?.map((t) => t.level)
    expect(levels).toEqual(['moment', 'journey'])
  })

  it('offers only the journey for unassigned media', () => {
    const orphan = med(22)
    const tree = buildWorkspaceTree([], [], [orphan])
    const levels = buildCoverTargetIndex(tree, JOURNEY, null)
      .get(orphan.id)
      ?.map((t) => t.level)
    expect(levels).toEqual(['journey'])
  })

  it('reports the explicitly stored current covers', () => {
    const moment = mom(10)
    const photo = med(20, { momentId: moment.id })
    const stage = seg(1, { coverMediaId: photo.id })
    const tree = buildWorkspaceTree(
      [stage],
      [{ ...moment, coverMediaId: null }],
      [photo],
    )
    const targets = buildCoverTargetIndex(tree, JOURNEY, photo.id).get(photo.id)
    expect(
      targets?.filter((t) => t.currentCoverId === photo.id).map((t) => t.level),
    ).toEqual(['stage', 'journey'])
  })
})
