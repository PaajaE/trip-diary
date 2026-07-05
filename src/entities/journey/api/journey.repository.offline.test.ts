import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import {
  canContributeToJourney,
  getJourney,
  persistMergedJourneyCache,
} from '@/entities/journey/api/journey.repository'
import {
  getJourneySnapshot,
  saveJourneySnapshot,
} from '@/entities/journey/api/local-journey-cache.repository'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { journeyDetailSchema } from '@/entities/journey/model/journey'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => true),
}))

const journeyId = crypto.randomUUID()
const journeyRow = {
  ends_at: null,
  id: journeyId,
  starts_at: null,
  status: 'active',
  space_id: crypto.randomUUID(),
  summary: 'Cached fixture',
  title: 'Cached trip',
}

function buildCachedJourney() {
  return journeyDetailSchema.parse({
    endsAt: null,
    entries: [],
    guides: [],
    id: journeyId,
    stages: [],
    startsAt: null,
    status: 'active',
    stops: [],
    spaceId: journeyRow.space_id,
    summary: journeyRow.summary,
    title: journeyRow.title,
  })
}

describe('journey offline cache', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
    await localDb.journeySnapshots.clear()
    await localDb.syncOperations.clear()
  })

  it('returns the cached journey when offline', async () => {
    const cached = buildCachedJourney()
    await saveJourneySnapshot(cached, true)

    const journey = await getJourney(journeyId)

    expect(journey).toMatchObject({
      id: journeyId,
      title: 'Cached trip',
    })
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('merges new offline moments into a cached journey', async () => {
    await saveJourneySnapshot(buildCachedJourney(), true)
    const creatorId = crypto.randomUUID()
    const entry = await createLocalEntry(creatorId, crypto.randomUUID(), {
      body: 'Added after cache',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: 'Offline moment',
      type: 'story',
      visibility: 'public',
    })
    await saveLocalJourneyLink({
      creatorId,
      entryId: entry.id,
      journeyId,
      stageId: null,
      stopId: null,
    })

    const journey = await getJourney(journeyId)

    expect(journey?.entries).toContainEqual(
      expect.objectContaining({
        id: entry.id,
        title: 'Offline moment',
      }),
    )
  })

  it('uses the cached contribution flag when offline', async () => {
    await saveJourneySnapshot(buildCachedJourney(), true)

    await expect(canContributeToJourney(journeyId)).resolves.toBe(true)
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('persists merged offline moments into the journey snapshot', async () => {
    await saveJourneySnapshot(buildCachedJourney(), true)
    const creatorId = crypto.randomUUID()
    const entry = await createLocalEntry(creatorId, crypto.randomUUID(), {
      body: 'Added after cache',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: 'Offline moment',
      type: 'story',
      visibility: 'public',
    })
    await saveLocalJourneyLink({
      creatorId,
      entryId: entry.id,
      journeyId,
      stageId: null,
      stopId: null,
    })

    const merged = await persistMergedJourneyCache(journeyId, {
      body: 'Added after cache',
      entryId: entry.id,
      entrySlug: entry.slug,
      entryTitle: 'Offline moment',
      eventAt: entry.eventAt,
      type: entry.type,
    })
    const snapshot = await getJourneySnapshot(journeyId)

    expect(merged?.entries).toContainEqual(
      expect.objectContaining({
        id: entry.id,
        title: 'Offline moment',
      }),
    )
    expect(snapshot?.journey.entries).toContainEqual(
      expect.objectContaining({
        id: entry.id,
        title: 'Offline moment',
      }),
    )
  })
})
