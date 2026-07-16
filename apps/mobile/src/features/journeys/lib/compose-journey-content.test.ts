import { describe, expect, it } from 'vitest'
import { composeJourneyContent } from '@/features/journeys/lib/compose-journey-content'
import type { JourneyFullDetail } from '@/features/journeys/model/journey-detail'

const baseJourney: JourneyFullDetail = {
  endsAt: null,
  entries: [],
  id: '50000000-0000-4000-8000-000000000001',
  spaceId: '50000000-0000-4000-8000-000000000099',
  stages: [
    {
      id: '60000000-0000-4000-8000-000000000001',
      summary: '',
      title: 'Day 1',
    },
  ],
  startsAt: null,
  status: 'active',
  stops: [],
  summary: '',
  title: 'Trip',
}

describe('composeJourneyContent', () => {
  it('groups moments under their stage', () => {
    const content = composeJourneyContent({
      ...baseJourney,
      entries: [
        {
          body: 'Body',
          coverPreviewUrl: null,
          createdAt: '2026-07-15T10:00:00.000Z',
          eventAt: '2026-07-15T10:00:00.000Z',
          id: '70000000-0000-4000-8000-000000000001',
          slug: 'moment-1',
          stageId: '60000000-0000-4000-8000-000000000001',
          stopId: null,
          title: 'Moment',
          type: 'story',
        },
      ],
    })

    expect(content.stageContents).toHaveLength(1)
    expect(content.stageContents[0]?.moments).toHaveLength(1)
    expect(content.stageContents[0]?.stage?.title).toBe('Day 1')
  })

  it('orders unassigned day groups newest first', () => {
    const content = composeJourneyContent({
      ...baseJourney,
      stages: [],
      entries: [
        {
          body: 'Earlier',
          coverPreviewUrl: null,
          createdAt: '2026-07-12T09:00:00.000Z',
          eventAt: '2026-07-12T09:00:00.000Z',
          id: '70000000-0000-4000-8000-000000000002',
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Morning',
          type: 'story',
        },
        {
          body: 'Later',
          coverPreviewUrl: null,
          createdAt: '2026-07-13T18:00:00.000Z',
          eventAt: '2026-07-13T18:00:00.000Z',
          id: '70000000-0000-4000-8000-000000000003',
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Evening',
          type: 'story',
        },
      ],
    })

    expect(content.stageContents).toHaveLength(2)
    expect(content.stageContents[0]?.moments[0]?.entry.title).toBe('Evening')
    expect(content.stageContents[1]?.moments[0]?.entry.title).toBe('Morning')
  })
})
