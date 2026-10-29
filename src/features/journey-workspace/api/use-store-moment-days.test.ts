import { describe, expect, it } from 'vitest'
import { momentDaysToStore } from '@/features/journey-workspace/api/use-store-moment-days'
import { buildWorkspaceTree } from '@/features/journey-workspace/model/workspace-tree'
import { med, mom } from '@/features/journey-workspace/test-fixtures'

describe('momentDaysToStore', () => {
  // Campfire shot at 00:40 on 3 Jun in Edmonton, then the next morning.
  const night = mom(1, {
    endsAt: '2026-06-03T07:10:00+00:00',
    startsAt: '2026-06-03T06:40:00+00:00',
  })
  const morning = mom(2, {
    endsAt: '2026-06-03T15:30:00+00:00',
    startsAt: '2026-06-03T15:00:00+00:00',
  })
  const photo = (n: number, momentId: string) =>
    med(n, {
      capturedAt: '2026-06-03T15:00:00+00:00',
      capturedTz: 'America/Edmonton',
      momentId,
    })

  it('stores the night-based day on the clock of the capture zone', () => {
    const tree = buildWorkspaceTree(
      [],
      [night, morning],
      [photo(1, night.id), photo(2, morning.id)],
      null,
    )
    expect(
      momentDaysToStore(tree, 'Europe/Prague').map(({ day, id }) => [id, day]),
    ).toEqual([
      [night.id, '2026-06-02'],
      [morning.id, '2026-06-03'],
    ])
  })

  it('skips moments whose stored day is already right', () => {
    const stored = { ...night, localDay: '2026-06-02' }
    const tree = buildWorkspaceTree(
      [],
      [stored, morning],
      [photo(1, night.id), photo(2, morning.id)],
      null,
    )
    expect(
      momentDaysToStore(tree, 'Europe/Prague').map((entry) => entry.id),
    ).toEqual([morning.id])
  })
})
