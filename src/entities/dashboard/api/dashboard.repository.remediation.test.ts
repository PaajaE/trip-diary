import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardData } from '@/entities/dashboard/api/dashboard.repository'
import { getSupabaseClient } from '@/shared/api/supabase'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
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

describe('dashboard standalone entry remediation', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
  })

  it('does not return a journey-linked entry as a standalone dashboard memory', async () => {
    const userId = crypto.randomUUID()
    const entryId = crypto.randomUUID()
    const journeyId = crypto.randomUUID()
    const builders = {
      entries: createQueryBuilder({
        data: [
          {
            event_at: '2026-06-01T12:00:00+00:00',
            id: entryId,
            published_at: '2026-06-01T12:00:00+00:00',
            status: 'published',
            title: 'Journey moment',
            type: 'story',
            updated_at: '2026-06-01T12:00:00+00:00',
            visibility: 'public',
          },
        ],
        error: null,
      }),
      entry_journey_links: createQueryBuilder({
        data: [{ entry_id: entryId, journey_id: journeyId }],
        error: null,
      }),
      journey_members: createQueryBuilder({ data: [], error: null }),
    }
    const from = vi.fn((table: keyof typeof builders) => builders[table])
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never)

    const dashboard = await getDashboardData({ userId })

    expect(dashboard.entries).toEqual([])
    expect(from).toHaveBeenCalledWith('entry_journey_links')
  })
})
