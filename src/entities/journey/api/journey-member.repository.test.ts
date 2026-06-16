import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listJourneyMembers } from '@/entities/journey/api/journey-member.repository'
import { getSupabaseClient } from '@/shared/api/supabase'

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
    select: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }

  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  return builder
}

describe('listJourneyMembers', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
  })

  it('maps journey members with profile data', async () => {
    const journeyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const members = createQueryBuilder({
      data: [
        {
          created_at: '2026-06-10T12:00:00+00:00',
          role: 'owner',
          user_id: userId,
        },
      ],
      error: null,
    })
    const profiles = createQueryBuilder({
      data: [
        {
          avatar_url: null,
          display_name: 'Ečerovi',
          id: userId,
          username: 'ecerovi',
        },
      ],
      error: null,
    })

    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'journey_members') return members
        return profiles
      }),
    } as never)

    await expect(listJourneyMembers(journeyId)).resolves.toEqual([
      {
        avatarUrl: null,
        displayName: 'Ečerovi',
        joinedAt: '2026-06-10T12:00:00+00:00',
        role: 'owner',
        userId,
        username: 'ecerovi',
      },
    ])
  })
})
