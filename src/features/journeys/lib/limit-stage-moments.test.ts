import { describe, expect, it } from 'vitest'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'
import { limitStageMoments } from '@/features/journeys/lib/limit-stage-moments'

function moment(id: string): JourneyStageContent['moments'][number] {
  return {
    entry: {
      body: '',
      eventAt: null,
      id,
      slug: id,
      stageId: null,
      stopId: null,
      title: id,
      type: 'story',
    },
    location: null,
    stop: null,
  }
}

function stage(ids: string[]): JourneyStageContent {
  return {
    dayKey: null,
    moments: ids.map(moment),
    plannedStops: [],
    stage: null,
  }
}

describe('limitStageMoments', () => {
  it('keeps all moments when under the limit', () => {
    const result = limitStageMoments([stage(['a', 'b'])], 8)
    expect(result.hiddenCount).toBe(0)
    expect(result.total).toBe(2)
    expect(result.stages[0]?.moments).toHaveLength(2)
  })

  it('hides later moments across stages', () => {
    const result = limitStageMoments(
      [stage(['a', 'b', 'c']), stage(['d', 'e'])],
      3,
    )
    expect(result.total).toBe(5)
    expect(result.hiddenCount).toBe(2)
    expect(result.stages).toHaveLength(1)
    expect(result.stages[0]?.moments.map((item) => item.entry.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })
})
