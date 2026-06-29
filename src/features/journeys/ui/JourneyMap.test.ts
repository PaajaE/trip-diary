import { describe, expect, it } from 'vitest'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'

describe('getJourneyMapPoints', () => {
  it('creates typed moment and planned points', () => {
    const moment = createMoment()
    const plannedStop = createStop({ title: 'Next camp' })

    expect(getJourneyMapPoints([moment], [plannedStop])).toEqual([
      {
        entryId: moment.entry.id,
        id: `moment:${moment.entry.id}`,
        latitude: 50,
        longitude: 14,
        photoId: null,
        title: 'Morning view',
        type: 'moment',
      },
      {
        entryId: null,
        id: `planned:${plannedStop.id}`,
        latitude: 50,
        longitude: 14,
        photoId: null,
        title: 'Next camp',
        type: 'planned',
      },
    ])
  })

  it('prefers photo pins over a moment marker for the same entry', () => {
    const moment = createMoment()
    const photo = {
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
      id: crypto.randomUUID(),
      latitude: 50.1,
      longitude: 14.1,
    }

    expect(getJourneyMapPoints([moment], [], [photo])).toEqual([
      {
        entryId: moment.entry.id,
        id: `photo:${photo.id}`,
        latitude: 50.1,
        longitude: 14.1,
        photoId: photo.id,
        title: 'Morning view',
        type: 'photo',
      },
    ])
  })

  it('deduplicates repeated content and gives a linked moment priority over its stop', () => {
    const moment = createMoment()
    const linkedStop = moment.stop

    expect(
      getJourneyMapPoints(
        [moment, moment],
        linkedStop === null ? [] : [linkedStop, linkedStop],
      ),
    ).toMatchObject([
      {
        entryId: moment.entry.id,
        type: 'moment',
      },
    ])
  })

  it('keeps separate photo pins at the same coordinates', () => {
    const photoA = {
      entryId: crypto.randomUUID(),
      entryTitle: 'First shot',
      id: crypto.randomUUID(),
      latitude: 50,
      longitude: 14,
    }
    const photoB = {
      entryId: crypto.randomUUID(),
      entryTitle: 'Second shot',
      id: crypto.randomUUID(),
      latitude: 50,
      longitude: 14,
    }

    expect(getJourneyMapPoints([], [], [photoA, photoB])).toEqual([
      {
        entryId: photoA.entryId,
        id: `photo:${photoA.id}`,
        latitude: 50,
        longitude: 14,
        photoId: photoA.id,
        title: 'First shot',
        type: 'photo',
      },
      {
        entryId: photoB.entryId,
        id: `photo:${photoB.id}`,
        latitude: 50,
        longitude: 14,
        photoId: photoB.id,
        title: 'Second shot',
        type: 'photo',
      },
    ])
  })

  it('ignores points without finite coordinates', () => {
    const invalidMoment = createMoment({
      location: { latitude: Number.NaN, longitude: 14 },
    })
    const invalidStop = createStop({ mapLatitude: null })

    expect(getJourneyMapPoints([invalidMoment], [invalidStop])).toEqual([])
  })
})

function createMoment(overrides: Partial<JourneyMoment> = {}): JourneyMoment {
  const stop = createStop({ status: 'visited', title: 'Morning view' })

  return {
    entry: {
      body: '',
      eventAt: null,
      id: crypto.randomUUID(),
      slug: null,
      stageId: null,
      stopId: stop.id,
      title: 'Morning view',
      type: 'story',
    },
    location: { latitude: 50, longitude: 14 },
    stop,
    ...overrides,
  }
}

function createStop(
  overrides: Partial<JourneyDetail['stops'][number]> = {},
): JourneyDetail['stops'][number] {
  return {
    id: crypto.randomUUID(),
    mapLatitude: 50,
    mapLongitude: 14,
    notes: '',
    stageId: null,
    status: 'planned',
    title: 'Planned stop',
    ...overrides,
  }
}
