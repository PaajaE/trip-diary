import { describe, expect, it } from 'vitest'
import {
  dashboardDataSchema,
  dashboardQuerySchema,
} from '@/entities/dashboard/model/dashboard'

describe('dashboard models', () => {
  it('applies compact dashboard query defaults', () => {
    expect(
      dashboardQuerySchema.parse({ userId: crypto.randomUUID() }),
    ).toMatchObject({
      journeyLimit: 6,
    })
  })

  it('rejects invalid card data returned by the backend', () => {
    const result = dashboardDataSchema.safeParse({
      journeys: [
        {
          endsAt: null,
          id: crypto.randomUUID(),
          role: 'viewer',
          startsAt: null,
          status: 'planning',
          summary: '',
          title: 'Canada 2026',
          updatedAt: 'not-a-date',
          visibility: 'public',
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})
