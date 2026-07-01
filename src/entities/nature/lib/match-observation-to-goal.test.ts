import { describe, expect, it } from 'vitest'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import {
  matchObservationToGoal,
  rankGoalsForSpotting,
} from '@/entities/nature/lib/match-observation-to-goal'

function goal(
  overrides: Partial<JourneyChecklistItem> &
    Pick<JourneyChecklistItem, 'title'>,
): JourneyChecklistItem {
  return {
    category: 'wildlife',
    checkedAt: null,
    entryId: null,
    id: crypto.randomUUID(),
    itemSlug: 'item',
    notes: '',
    position: 0,
    stopId: null,
    templateSlug: 'sumava',
    ...overrides,
  }
}

describe('match-observation-to-goal', () => {
  it('prioritizes explicit goal id', () => {
    const targetId = '11111111-1111-4111-8111-111111111111'
    const target = goal({ id: targetId, title: 'Lynx' })
    const other = goal({ title: 'Capercaillie' })

    const ranked = rankGoalsForSpotting([other, target], {
      goalId: target.id,
    })

    expect(ranked[0]?.id).toBe(target.id)
  })

  it('matches common name to goal title', () => {
    const lynx = goal({ title: 'Eurasian lynx' })
    const orchid = goal({ category: 'flora', title: 'Early-purple orchid' })

    expect(matchObservationToGoal([lynx, orchid], 'lynx tracks')?.title).toBe(
      'Eurasian lynx',
    )
  })
})
