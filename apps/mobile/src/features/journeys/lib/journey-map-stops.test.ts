import { describe, expect, it } from 'vitest'
import {
  parseRemoteJourneyStopRows,
  sortJourneyStops,
  toMappableJourneyStops,
} from '@/features/journeys/lib/journey-map-stops'

const brnoStop = {
  id: '22222222-2222-4222-8222-222222222222',
  map_latitude: 49.1951,
  map_longitude: 16.6068,
  notes: 'Brno',
  position: 1,
  stage_id: null,
  status: 'visited',
  title: 'Brno',
}

describe('journey map stops', () => {
  it('maps valid remote rows in position order', () => {
    const stops = parseRemoteJourneyStopRows([
      {
        ...brnoStop,
        id: '33333333-3333-4333-8333-333333333333',
        position: 2,
        title: 'Second',
      },
      brnoStop,
    ])

    expect(stops.map((stop) => stop.title)).toEqual(['Brno', 'Second'])
  })

  it('skips malformed rows and duplicate ids', () => {
    const stops = parseRemoteJourneyStopRows([
      brnoStop,
      { ...brnoStop, title: 'Duplicate' },
      { id: 'bad', map_latitude: 120, map_longitude: 0, status: 'planned', title: 'Bad' },
    ])

    expect(stops).toHaveLength(1)
    expect(stops[0]?.title).toBe('Brno')
  })

  it('filters mappable stops with finite coordinates only', () => {
    const stops = parseRemoteJourneyStopRows([
      brnoStop,
      {
        id: '33333333-3333-4333-8333-333333333333',
        map_latitude: null,
        map_longitude: null,
        notes: '',
        position: 2,
        stage_id: null,
        status: 'planned',
        title: 'No coords',
      },
    ])

    expect(toMappableJourneyStops(stops)).toEqual([
      {
        id: brnoStop.id,
        latitude: 49.1951,
        longitude: 16.6068,
        status: 'visited',
        title: 'Brno',
      },
    ])
  })

  it('sorts deterministically by position, title, and id', () => {
    const sorted = sortJourneyStops([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        mapLatitude: 1,
        mapLongitude: 1,
        notes: '',
        position: 1,
        stageId: null,
        status: 'planned',
        title: 'Brno',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        mapLatitude: 2,
        mapLongitude: 2,
        notes: '',
        position: 1,
        stageId: null,
        status: 'planned',
        title: 'Brno',
      },
    ])

    expect(sorted[0]?.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })
})
