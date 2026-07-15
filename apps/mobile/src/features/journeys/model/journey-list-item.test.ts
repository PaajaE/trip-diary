import { describe, expect, it } from 'vitest'
import {
  mapRemoteJourneyListRow,
  parseCachedJourneyListItem,
} from '@/features/journeys/model/journey-list-item'

const sampleItem = {
  ends_at: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  starts_at: '2026-07-10',
  status: 'active' as const,
  summary: 'Coastal route',
  title: 'Summer trip',
  updated_at: '2026-07-10T08:00:00.000+00:00',
}

const domainItem = {
  endsAt: '2026-07-20',
  id: '11111111-1111-4111-8111-111111111111',
  startsAt: '2026-07-10',
  status: 'active' as const,
  summary: 'Coastal route',
  title: 'Summer trip',
  updatedAt: '2026-07-10T08:00:00.000+00:00',
}

describe('journey list item schema', () => {
  it('parses legacy cached payloads into shared domain items', () => {
    expect(parseCachedJourneyListItem(sampleItem)).toEqual(domainItem)
  })

  it('rejects invalid cached payloads', () => {
    expect(parseCachedJourneyListItem(null)).toBeNull()
    expect(parseCachedJourneyListItem({ id: 'only-id' })).toBeNull()
    expect(
      parseCachedJourneyListItem({
        ...sampleItem,
        status: 'draft',
      }),
    ).toBeNull()
  })

  it('maps remote rows into the shared list contract', () => {
    expect(mapRemoteJourneyListRow(sampleItem)).toEqual(domainItem)
  })
})
