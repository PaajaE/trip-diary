import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import {
  getJourney,
  getJourneyFromCache,
} from '@/entities/journey/api/journey.repository'
import { saveJourneySnapshot } from '@/entities/journey/api/local-journey-cache.repository'
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
const spaceId = crypto.randomUUID()
const entryId = crypto.randomUUID()

function buildRemoteJourney() {
  return journeyDetailSchema.parse({
    endsAt: null,
    entries: [
      {
        body: 'Remote body',
        eventAt: '2026-06-01T12:00:00+00:00',
        id: entryId,
        slug: null,
        stageId: null,
        stopId: null,
        title: 'Remote title',
        type: 'story',
      },
    ],
    guides: [],
    id: journeyId,
    stages: [],
    startsAt: null,
    status: 'active',
    stops: [],
    spaceId,
    summary: 'Remote summary',
    title: 'Remote trip',
  })
}

function mockRemoteJourneyFetch() {
  const journeyRow = {
    ends_at: null,
    id: journeyId,
    space_id: spaceId,
    starts_at: null,
    status: 'active',
    summary: 'Remote summary',
    title: 'Remote trip',
  }

  function createListBuilder(data: unknown[]) {
    const builder = {
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
      then: (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data, error: null }).then(resolve, reject),
    }
    builder.eq.mockReturnValue(builder)
    builder.in.mockReturnValue(builder)
    builder.order.mockReturnValue(builder)
    builder.select.mockReturnValue(builder)
    return builder
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'journeys') {
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: journeyRow, error: null }),
          select: vi.fn().mockReturnThis(),
        }
      }
      if (table === 'entry_journey_links') {
        return createListBuilder([
          {
            entry_id: entryId,
            journey_id: journeyId,
            stage_id: null,
            stop_id: null,
          },
        ])
      }
      if (table === 'entries') {
        return createListBuilder([
          {
            body: 'Remote body',
            event_at: '2026-06-01T12:00:00+00:00',
            id: entryId,
            slug: null,
            title: 'Remote title',
            type: 'story',
          },
        ])
      }
      return createListBuilder([])
    }),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  }
  vi.mocked(getSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof getSupabaseClient>,
  )
}

describe('journey cache-first reads', () => {
  beforeEach(() => {
    vi.mocked(network.isBrowserOnline).mockReturnValue(true)
    vi.mocked(getSupabaseClient).mockReset()
  })

  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
    await localDb.journeySnapshots.clear()
    await localDb.syncOperations.clear()
  })

  it('reads merged local deltas from getJourneyFromCache', async () => {
    const cached = buildRemoteJourney()
    await saveJourneySnapshot(cached, true)
    const creatorId = crypto.randomUUID()
    const entry = await createLocalEntry(creatorId, spaceId, {
      body: 'Local only',
      eventAt: new Date().toISOString(),
      language: 'cs',
      title: 'Local moment',
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

    const journey = await getJourneyFromCache(journeyId)

    expect(journey?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: entryId, title: 'Remote title' }),
        expect.objectContaining({ id: entry.id, title: 'Local moment' }),
      ]),
    )
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })

  it('merges pending local entry edits when online', async () => {
    mockRemoteJourneyFetch()
    const creatorId = crypto.randomUUID()
    await localDb.entries.put({
      body: 'Edited offline body',
      createdAt: new Date().toISOString(),
      creatorId,
      eventAt: '2026-06-01T12:00:00+00:00',
      id: entryId,
      language: 'cs',
      publishedAt: null,
      slug: 'edited-offline',
      spaceId,
      status: 'draft',
      syncStatus: 'pending',
      title: 'Edited offline title',
      type: 'story',
      updatedAt: new Date().toISOString(),
      version: 1,
      visibility: 'public',
    })

    const journey = await getJourney(journeyId)

    expect(journey?.entries).toContainEqual(
      expect.objectContaining({
        body: 'Edited offline body',
        id: entryId,
        title: 'Edited offline title',
      }),
    )
  })
})
