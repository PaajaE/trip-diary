import { describe, expect, it } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'

describe('composeJourneyContent', () => {
  it('composes a linked stop into one located moment and keeps plans separate', () => {
    const stageId = crypto.randomUUID()
    const linkedStopId = crypto.randomUUID()
    const plannedStopId = crypto.randomUUID()
    const journey: JourneyDetail = {
      endsAt: null,
      entries: [
        {
          body: '',
          eventAt: null,
          id: crypto.randomUUID(),
          slug: null,
          stageId,
          stopId: linkedStopId,
          title: 'Lake Louise',
          type: 'story',
        },
      ],
      guides: [],
      id: crypto.randomUUID(),
      spaceId: crypto.randomUUID(),
      stages: [{ id: stageId, summary: '', title: 'Rockies' }],
      startsAt: null,
      status: 'active',
      stops: [
        {
          id: linkedStopId,
          mapLatitude: 51.43,
          mapLongitude: -116.18,
          notes: '',
          stageId,
          status: 'visited',
          title: 'Lake Louise',
        },
        {
          id: plannedStopId,
          mapLatitude: null,
          mapLongitude: null,
          notes: '',
          stageId,
          status: 'planned',
          title: 'Jasper',
        },
      ],
      summary: '',
      title: 'Canada',
    }

    const content = composeJourneyContent(journey)

    expect(content.moments).toHaveLength(1)
    expect(content.moments[0]?.location).toEqual({
      latitude: 51.43,
      longitude: -116.18,
    })
    expect(content.plannedStops).toMatchObject([{ id: plannedStopId }])
    expect(content.stageContents[0]).toMatchObject({
      moments: [{ entry: { title: 'Lake Louise' } }],
      plannedStops: [{ title: 'Jasper' }],
    })
  })

  it('keeps moments with unknown stage ids in the unassigned bucket', () => {
    const missingStageId = crypto.randomUUID()
    const journey: JourneyDetail = {
      endsAt: null,
      entries: [
        {
          body: 'Still visible',
          eventAt: null,
          id: crypto.randomUUID(),
          slug: null,
          stageId: missingStageId,
          stopId: null,
          title: 'Hidden stop',
          type: 'story',
        },
      ],
      guides: [],
      id: crypto.randomUUID(),
      spaceId: crypto.randomUUID(),
      stages: [],
      startsAt: null,
      status: 'active',
      stops: [],
      summary: '',
      title: 'Orphans',
    }

    const content = composeJourneyContent(journey)

    expect(content.stageContents).toHaveLength(1)
    expect(content.stageContents[0]?.stage).toBeNull()
    expect(content.stageContents[0]?.moments).toHaveLength(1)
  })
})
