import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardData } from '@/entities/dashboard/api/dashboard.repository'
import { saveDashboardCache } from '@/entities/dashboard/api/local-dashboard-cache.repository'
import { createLocalJourney } from '@/entities/journey/api/local-journey.repository'
import { saveJourneySnapshot } from '@/entities/journey/api/local-journey-cache.repository'
import { journeyDetailSchema } from '@/entities/journey/model/journey'
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
    await localDb.dashboardSnapshots.clear()
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
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

  it('returns cached dashboard journeys when offline', async () => {
    const userId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()

    await saveDashboardCache(userId, {
      entries: [],
      journeys: [
        {
          endsAt: null,
          id: journeyId,
          role: 'owner',
          startsAt: null,
          status: 'active',
          summary: 'Cached trip',
          title: 'Cached dashboard trip',
          updatedAt: new Date().toISOString(),
          visibility: 'public',
        },
      ],
    })

    const dashboard = await getDashboardData({ userId })

    expect(dashboard.journeys).toContainEqual(
      expect.objectContaining({
        id: journeyId,
        title: 'Cached dashboard trip',
      }),
    )
  })

  it('returns journey cards from snapshots linked to local entries', async () => {
    const userId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const now = new Date().toISOString()

    await saveJourneySnapshot(
      journeyDetailSchema.parse({
        endsAt: null,
        entries: [],
        guides: [],
        id: journeyId,
        stages: [],
        startsAt: null,
        status: 'active',
        stops: [],
        spaceId: crypto.randomUUID(),
        summary: 'Snapshot trip',
        title: 'Snapshot dashboard trip',
      }),
      true,
    )

    await localDb.journeyLinks.add({
      createdAt: now,
      creatorId: userId,
      entryId,
      journeyId,
      latitude: null,
      locationTitle: null,
      longitude: null,
      stageId: null,
      stopId: null,
    })

    const dashboard = await getDashboardData({ userId })

    expect(dashboard.journeys).toContainEqual(
      expect.objectContaining({
        id: journeyId,
        title: 'Snapshot dashboard trip',
      }),
    )
  })

  it('merges cached entries with local standalone entries offline', async () => {
    const userId = crypto.randomUUID()
    const cachedEntryId = crypto.randomUUID()
    const localEntryId = crypto.randomUUID()
    const now = new Date().toISOString()

    await saveDashboardCache(userId, {
      entries: [
        {
          eventAt: null,
          id: cachedEntryId,
          publishedAt: now,
          status: 'published',
          title: 'Cached note',
          type: 'note',
          updatedAt: now,
          visibility: 'public',
        },
      ],
      journeys: [],
    })

    await localDb.entries.add({
      body: 'Local body',
      createdAt: now,
      creatorId: userId,
      eventAt: now,
      id: localEntryId,
      language: 'cs',
      publishedAt: null,
      slug: null,
      spaceId: null,
      status: 'draft',
      syncStatus: 'pending',
      title: 'Local note',
      type: 'note',
      updatedAt: now,
      version: 1,
      visibility: 'public',
    })

    const dashboard = await getDashboardData({ userId })

    expect(dashboard.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: cachedEntryId, title: 'Cached note' }),
        expect.objectContaining({ id: localEntryId, title: 'Local note' }),
      ]),
    )
  })
})
