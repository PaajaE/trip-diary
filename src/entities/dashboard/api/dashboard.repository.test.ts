import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardData } from '@/entities/dashboard/api/dashboard.repository'
import { prefetchJourneySnapshot } from '@/entities/dashboard/api/prefetch-journey-snapshots'

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
}))

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: getSupabaseClientMock,
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => true),
}))

vi.mock('@/entities/dashboard/api/prefetch-journey-snapshots', () => ({
  prefetchJourneySnapshot: vi.fn(),
}))

interface QueryResult {
  data: unknown[]
  error: Error | null
}

function createQueryBuilder(result: QueryResult) {
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }

  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  return builder
}

describe('getDashboardData', () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset()
    vi.mocked(prefetchJourneySnapshot).mockReset()
  })

  it('loads and maps recent member journeys', async () => {
    const userId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const memberships = createQueryBuilder({
      data: [{ journey_id: journeyId, role: 'owner' }],
      error: null,
    })
    const journeys = createQueryBuilder({
      data: [
        {
          ends_at: null,
          id: journeyId,
          starts_at: '2026-06-01',
          status: 'active',
          summary: 'Across Canada',
          title: 'Canada 2026',
          updated_at: '2026-06-10T12:00:00+00:00',
          visibility: 'public',
        },
      ],
      error: null,
    })
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'journey_members') return memberships
        return journeys
      }),
    }
    getSupabaseClientMock.mockReturnValue(client)

    await expect(
      getDashboardData({ journeyLimit: 3, userId }),
    ).resolves.toEqual({
      journeys: [
        {
          endsAt: null,
          id: journeyId,
          role: 'owner',
          startsAt: '2026-06-01',
          status: 'active',
          summary: 'Across Canada',
          title: 'Canada 2026',
          updatedAt: '2026-06-10T12:00:00+00:00',
          visibility: 'public',
        },
      ],
    })

    expect(memberships.eq).toHaveBeenCalledWith('user_id', userId)
    expect(journeys.in).toHaveBeenCalledWith('id', [journeyId])
    expect(journeys.limit).toHaveBeenCalledWith(3)
    expect(prefetchJourneySnapshot).toHaveBeenCalledWith(journeyId)
  })

  it('does not query journeys when the user has no memberships', async () => {
    const memberships = createQueryBuilder({ data: [], error: null })
    const client = {
      from: vi.fn(() => memberships),
    }
    getSupabaseClientMock.mockReturnValue(client)

    await expect(
      getDashboardData({ userId: crypto.randomUUID() }),
    ).resolves.toEqual({
      journeys: [],
    })
    expect(client.from).not.toHaveBeenCalledWith('journeys')
  })

  it('falls back to local journeys when the remote dashboard read fails', async () => {
    const error = new Error('memberships unavailable')
    const memberships = createQueryBuilder({ data: [], error })
    getSupabaseClientMock.mockReturnValue({ from: vi.fn(() => memberships) })

    await expect(
      getDashboardData({ userId: crypto.randomUUID() }),
    ).resolves.toEqual({
      journeys: [],
    })
  })
})
