import { describe, expect, it } from 'vitest'
import { compareJourneyEntriesNewestFirst } from '@/entities/journey/lib/compare-journey-entries'

describe('compareJourneyEntriesNewestFirst', () => {
  it('orders by event_at DESC, then created_at DESC, then id DESC', () => {
    const older = {
      createdAt: '2026-07-10T10:00:00.000Z',
      eventAt: '2026-07-10T10:00:00.000Z',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }
    const newerEvent = {
      createdAt: '2026-07-09T09:00:00.000Z',
      eventAt: '2026-07-11T10:00:00.000Z',
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }
    const sameEventNewerCreated = {
      createdAt: '2026-07-12T10:00:00.000Z',
      eventAt: '2026-07-10T10:00:00.000Z',
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    }
    const sameTimesHigherId = {
      createdAt: '2026-07-10T10:00:00.000Z',
      eventAt: '2026-07-10T10:00:00.000Z',
      id: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
    }

    const sorted = [
      older,
      newerEvent,
      sameEventNewerCreated,
      sameTimesHigherId,
    ].sort(compareJourneyEntriesNewestFirst)

    expect(sorted.map((entry) => entry.id)).toEqual([
      newerEvent.id,
      sameEventNewerCreated.id,
      sameTimesHigherId.id,
      older.id,
    ])
  })

  it('places null event_at after dated moments', () => {
    const dated = {
      createdAt: '2026-07-01T00:00:00.000Z',
      eventAt: '2026-07-01T00:00:00.000Z',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }
    const undated = {
      createdAt: '2026-07-15T00:00:00.000Z',
      eventAt: null,
      id: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
    }

    expect(compareJourneyEntriesNewestFirst(dated, undated)).toBeLessThan(0)
    expect(compareJourneyEntriesNewestFirst(undated, dated)).toBeGreaterThan(0)
  })
})
