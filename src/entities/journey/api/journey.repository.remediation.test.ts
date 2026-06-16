import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getJourney } from '@/entities/journey/api/journey.repository'
import { saveLocalJourneyLink } from '@/entities/journey/api/local-journey-link.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

interface QueryResult {
  data: unknown
  error: Error | null
}

function createQueryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }

  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.maybeSingle.mockResolvedValue(result)
  builder.order.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  return builder
}

const journeyId = crypto.randomUUID()
const stageId = crypto.randomUUID()
const stopId = crypto.randomUUID()
const journeyRow = {
  ends_at: null,
  id: journeyId,
  starts_at: null,
  status: 'active',
  space_id: crypto.randomUUID(),
  summary: 'Characterization fixture',
  title: 'Canada 2026',
}

function mockJourneyQueries(options?: {
  entries?: unknown[]
  links?: unknown[]
  stages?: unknown[]
  stops?: unknown[]
}) {
  const results: Record<string, QueryResult> = {
    entries: { data: options?.entries ?? [], error: null },
    entry_journey_links: { data: options?.links ?? [], error: null },
    journey_guide_sections: { data: [], error: null },
    journey_stages: { data: options?.stages ?? [], error: null },
    journey_stops: { data: options?.stops ?? [], error: null },
    journeys: { data: journeyRow, error: null },
  }

  vi.mocked(getSupabaseClient).mockReturnValue({
    from: vi.fn((table: string) =>
      createQueryBuilder(results[table] ?? { data: [], error: null }),
    ),
  } as never)
}

describe('journey remediation projection', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
  })

  afterEach(async () => {
    await localDb.entries.clear()
    await localDb.journeyLinks.clear()
    await localDb.journeySnapshots.clear()
    await localDb.syncOperations.clear()
  })

  it.each([
    ['selected stage', stageId],
    ['no stage', null],
  ])(
    'keeps an offline journey moment in its journey with %s',
    async (_, assignedStageId) => {
      mockJourneyQueries({
        stages: [{ id: stageId, summary: '', title: 'Rockies' }],
      })
      const creatorId = crypto.randomUUID()
      const entry = await createLocalEntry(creatorId, crypto.randomUUID(), {
        body: 'Visible before synchronization',
        eventAt: new Date().toISOString(),
        language: 'en',
        title: 'Offline Banff',
        type: 'story',
        visibility: 'public',
      })
      await saveLocalJourneyLink({
        creatorId,
        entryId: entry.id,
        journeyId,
        stageId: assignedStageId,
        stopId: null,
      })

      const journey = await getJourney(journeyId)

      expect(journey?.entries).toContainEqual(
        expect.objectContaining({
          id: entry.id,
          stageId: assignedStageId,
          title: 'Offline Banff',
        }),
      )
    },
  )

  it('projects an offline selected location into the journey map', async () => {
    mockJourneyQueries()
    const creatorId = crypto.randomUUID()
    const entry = await createLocalEntry(creatorId, crypto.randomUUID(), {
      body: '',
      eventAt: new Date().toISOString(),
      language: 'en',
      title: 'Offline Banff',
      type: 'story',
      visibility: 'public',
    })
    const localStopId = crypto.randomUUID()
    await saveLocalJourneyLink({
      creatorId,
      entryId: entry.id,
      journeyId,
      latitude: 51.18,
      locationTitle: 'Banff',
      longitude: -115.57,
      stageId: null,
      stopId: localStopId,
    })

    const journey = await getJourney(journeyId)

    expect(journey?.stops).toContainEqual(
      expect.objectContaining({
        id: localStopId,
        mapLatitude: 51.18,
        mapLongitude: -115.57,
        status: 'visited',
      }),
    )
  })

  it.fails(
    'composes a linked visited stop and entry into one journey moment instead of two records',
    async () => {
      const entryId = crypto.randomUUID()
      mockJourneyQueries({
        entries: [
          {
            body: 'Lake at sunrise',
            event_at: '2026-06-01T12:00:00+00:00',
            id: entryId,
            title: 'Lake Louise',
            type: 'story',
          },
        ],
        links: [{ entry_id: entryId, stage_id: stageId, stop_id: stopId }],
        stages: [{ id: stageId, summary: '', title: 'Rockies' }],
        stops: [
          {
            id: stopId,
            map_latitude: 51.43,
            map_longitude: -116.18,
            notes: '',
            stage_id: stageId,
            status: 'visited',
            title: 'Lake Louise',
          },
        ],
      })

      const projection = (await getJourney(journeyId)) as unknown as {
        moments: { entry: { id: string }; location: unknown; stageId: string }[]
        plannedStops: unknown[]
      }

      expect(projection.moments).toHaveLength(1)
      expect(projection.moments[0]).toMatchObject({
        entry: { id: entryId },
        location: { latitude: 51.43, longitude: -116.18 },
        stageId,
      })
      expect(projection.plannedStops).toEqual([])
    },
  )

  it.fails(
    'exposes one projection contract for journey timeline, map, and gallery',
    async () => {
      const entryId = crypto.randomUUID()
      const plannedStopId = crypto.randomUUID()
      mockJourneyQueries({
        entries: [
          {
            body: 'A located and photographed moment',
            event_at: '2026-06-01T12:00:00+00:00',
            id: entryId,
            title: 'Banff',
            type: 'story',
          },
        ],
        links: [{ entry_id: entryId, stage_id: null, stop_id: stopId }],
        stops: [
          {
            id: stopId,
            map_latitude: 51.18,
            map_longitude: -115.57,
            notes: '',
            stage_id: null,
            status: 'visited',
            title: 'Banff',
          },
          {
            id: plannedStopId,
            map_latitude: 51.05,
            map_longitude: -114.07,
            notes: '',
            stage_id: null,
            status: 'planned',
            title: 'Calgary',
          },
        ],
      })

      const projection = (await getJourney(journeyId)) as unknown as {
        moments: {
          entry: { id: string }
          location: { latitude: number; longitude: number }
          photos: unknown[]
        }[]
        photos: unknown[]
        plannedStops: { id: string }[]
      }

      expect(projection.moments).toMatchObject([
        {
          entry: { id: entryId },
          location: { latitude: 51.18, longitude: -115.57 },
        },
      ])
      expect(Array.isArray(projection.moments[0]?.photos)).toBe(true)
      expect(Array.isArray(projection.photos)).toBe(true)
      expect(projection.plannedStops).toEqual([{ id: plannedStopId }])
    },
  )
})
