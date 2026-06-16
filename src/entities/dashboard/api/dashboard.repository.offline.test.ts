import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardData } from '@/entities/dashboard/api/dashboard.repository'
import { createLocalJourney } from '@/entities/journey/api/local-journey.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => false),
}))

describe('getDashboardData offline journeys', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.journeySnapshots.clear()
    await localDb.localJourneys.clear()
    await localDb.syncOperations.clear()
  })

  it('returns locally created journeys when offline', async () => {
    const userId = crypto.randomUUID()
    const journeyId = await createLocalJourney(userId, crypto.randomUUID(), {
      endsAt: null,
      startsAt: null,
      summary: 'Saved on device',
      title: 'Offline dashboard trip',
    })

    const dashboard = await getDashboardData({ userId })

    expect(getSupabaseClient).not.toHaveBeenCalled()
    expect(dashboard.journeys).toContainEqual(
      expect.objectContaining({
        id: journeyId,
        syncStatus: 'pending',
        title: 'Offline dashboard trip',
      }),
    )
  })
})
