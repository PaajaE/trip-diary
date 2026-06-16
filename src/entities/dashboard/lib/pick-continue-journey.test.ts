import { describe, expect, it } from 'vitest'
import { pickContinueJourney } from '@/entities/dashboard/lib/pick-continue-journey'
import type { DashboardJourneyCard } from '@/entities/dashboard/model/dashboard'

function journey(
  overrides: Partial<DashboardJourneyCard> &
    Pick<DashboardJourneyCard, 'id' | 'title'>,
): DashboardJourneyCard {
  return {
    endsAt: null,
    role: 'owner',
    startsAt: null,
    status: 'planning',
    summary: '',
    updatedAt: '2026-06-01T12:00:00+00:00',
    visibility: 'public',
    ...overrides,
  }
}

describe('pickContinueJourney', () => {
  it('prefers an active trip over a newer planned one', () => {
    const active = journey({
      id: crypto.randomUUID(),
      status: 'active',
      title: 'Active trip',
      updatedAt: '2026-06-01T10:00:00+00:00',
    })
    const planned = journey({
      id: crypto.randomUUID(),
      status: 'planning',
      title: 'Newer plan',
      updatedAt: '2026-06-02T10:00:00+00:00',
    })

    expect(pickContinueJourney([planned, active])).toEqual(active)
  })

  it('falls back to the most recent journey', () => {
    const older = journey({
      id: crypto.randomUUID(),
      status: 'completed',
      title: 'Older trip',
      updatedAt: '2026-06-01T10:00:00+00:00',
    })
    const newer = journey({
      id: crypto.randomUUID(),
      status: 'completed',
      title: 'Newer trip',
      updatedAt: '2026-06-03T10:00:00+00:00',
    })

    expect(pickContinueJourney([newer, older])).toEqual(newer)
  })
})
