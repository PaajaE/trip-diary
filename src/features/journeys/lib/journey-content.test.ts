import { describe, expect, it } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import {
  eventAtForDayKey,
  formatJourneyDayLabel,
  getMomentDayKey,
  UNDATED_DAY_KEY,
} from '@/features/journeys/lib/journey-stage-label'

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
      dayKey: null,
      moments: [{ entry: { title: 'Lake Louise' } }],
      plannedStops: [{ title: 'Jasper' }],
      stage: { id: stageId },
    })
  })

  it('groups unassigned moments by calendar day', () => {
    const journey: JourneyDetail = {
      endsAt: null,
      entries: [
        {
          body: 'Later',
          eventAt: '2026-06-13T18:00:00.000Z',
          id: crypto.randomUUID(),
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Evening',
          type: 'story',
        },
        {
          body: 'Earlier',
          eventAt: '2026-06-12T09:00:00.000Z',
          id: crypto.randomUUID(),
          slug: null,
          stageId: null,
          stopId: null,
          title: 'Morning',
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
      title: 'Auto days',
    }

    const content = composeJourneyContent(journey)

    expect(content.stageContents).toHaveLength(2)
    expect(content.stageContents[0]?.dayKey).toBe('2026-06-12')
    expect(content.stageContents[0]?.moments[0]?.entry.title).toBe('Morning')
    expect(content.stageContents[1]?.dayKey).toBe('2026-06-13')
    expect(content.stageContents[1]?.moments[0]?.entry.title).toBe('Evening')
  })

  it('keeps moments with unknown stage ids in auto day buckets', () => {
    const missingStageId = crypto.randomUUID()
    const journey: JourneyDetail = {
      endsAt: null,
      entries: [
        {
          body: 'Still visible',
          eventAt: '2026-06-12T12:00:00.000Z',
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
    expect(content.stageContents[0]?.dayKey).toBe('2026-06-12')
    expect(content.stageContents[0]?.moments).toHaveLength(1)
  })
})

describe('journey day helpers', () => {
  it('derives day keys and formatted labels', () => {
    expect(getMomentDayKey(null)).toBe(UNDATED_DAY_KEY)
    expect(getMomentDayKey('2026-06-12T23:30:00.000Z')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
    expect(formatJourneyDayLabel('2026-06-12', 'en-US')).toContain('2026')
  })

  it('preserves time when moving to another day', () => {
    const next = eventAtForDayKey('2026-06-15', '2026-06-12T18:30:00.000Z')
    expect(next).not.toBeNull()
    expect(new Date(next ?? '').getDate()).toBe(15)
    expect(new Date(next ?? '').getHours()).toBe(
      new Date('2026-06-12T18:30:00.000Z').getHours(),
    )
  })
})
