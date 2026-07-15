import { describe, expect, it } from 'vitest'
import { formatLastSyncTime } from '@/features/sync/lib/format-last-sync-time'

describe('formatLastSyncTime', () => {
  it('returns just_now for recent sync timestamps', () => {
    const now = new Date('2026-07-10T14:32:00.000Z')
    expect(
      formatLastSyncTime('2026-07-10T14:31:45.000Z', 'en', now),
    ).toBe('just_now')
  })

  it('formats older sync timestamps for the locale', () => {
    const now = new Date('2026-07-10T16:00:00.000Z')
    const formatted = formatLastSyncTime(
      '2026-07-10T14:32:00.000Z',
      'cs',
      now,
    )

    expect(formatted).toEqual({ time: expect.stringMatching(/7|07/) })
  })

  it('returns null when no sync timestamp exists', () => {
    expect(formatLastSyncTime(null, 'en')).toBeNull()
  })
})
