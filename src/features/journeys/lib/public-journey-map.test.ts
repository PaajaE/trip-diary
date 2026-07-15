import { describe, expect, it } from 'vitest'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  getEntryIdFromMapPoint,
  getMapPointIdForMoment,
  getPublicJourneyMapPoints,
  momentHasMapMarker,
  resolvePublicMapFocusPointId,
  resolvePublicJourneyMapBoundsCoordinates,
} from '@/features/journeys/lib/public-journey-map'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'

describe('public-journey-map', () => {
  it('does not render natural destinations on the public map', () => {
    const stop = createStop({ title: 'Peregrine cliff' })
    const checklistItem = createChecklistItem({
      stopId: stop.id,
      title: 'Peregrine falcon',
    })
    const moment = createMoment()

    const publicPoints = getPublicJourneyMapPoints([moment], [])
    const privatePoints = getJourneyMapPoints([], [stop], [], {
      checklistItems: [checklistItem],
      observations: [],
    })

    expect(publicPoints.some((point) => point.type === 'nature-goal')).toBe(
      false,
    )
    expect(publicPoints.some((point) => point.type === 'planned')).toBe(false)
    expect(privatePoints.some((point) => point.type === 'nature-goal')).toBe(
      true,
    )
  })

  it('does not include natural destinations in public bounds', () => {
    const stop = createStop({ mapLatitude: 55, mapLongitude: 18 })
    const checklistItem = createChecklistItem({ stopId: stop.id })
    const moment = createMoment({
      location: { latitude: 50, longitude: 14 },
    })
    const laterMoment = createMoment({
      entry: {
        body: '',
        eventAt: '2026-01-02T08:00:00.000Z',
        id: crypto.randomUUID(),
        slug: null,
        stageId: null,
        stopId: null,
        title: 'Later',
        type: 'story',
      },
      location: { latitude: 51, longitude: 15 },
      stop: null,
    })

    const bounds = resolvePublicJourneyMapBoundsCoordinates(
      [moment, laterMoment],
      [],
    )
    const naturePoint = getJourneyMapPoints([], [stop], [], {
      checklistItems: [checklistItem],
      observations: [],
    })[0]
    expect(naturePoint).toBeDefined()

    expect(bounds).toEqual([
      { latitude: 50, longitude: 14 },
      { latitude: 51, longitude: 15 },
    ])
    expect(
      bounds.some(
        (point) =>
          point.latitude === naturePoint!.latitude &&
          point.longitude === naturePoint!.longitude,
      ),
    ).toBe(false)
  })

  it('maps active moments to marker ids and back', () => {
    const moment = createMoment()
    const photo = {
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
      id: crypto.randomUUID(),
      latitude: 50.1,
      longitude: 14.1,
    }
    const points = getPublicJourneyMapPoints([moment], [photo])
    const pointId = getMapPointIdForMoment(moment.entry.id, points)

    expect(pointId).toBe(`photo:${photo.id}`)
    expect(getEntryIdFromMapPoint(pointId, points)).toBe(moment.entry.id)
  })

  it('does not create a marker for moments without coordinates', () => {
    const moment = createMoment({ location: null, stop: null })
    const points = getPublicJourneyMapPoints([moment], [])

    expect(momentHasMapMarker(moment.entry.id, points)).toBe(false)
  })

  it('updates the active marker when a moment is activated', () => {
    const moment = createMoment()
    const points = getPublicJourneyMapPoints([moment], [])

    expect(resolvePublicMapFocusPointId(moment.entry.id, null, points)).toBe(
      `moment:${moment.entry.id}`,
    )
  })

  it('prefers a pending photo pin when showing a gallery photo on the map', () => {
    const moment = createMoment()
    const photo = {
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
      id: crypto.randomUUID(),
      latitude: 50.1,
      longitude: 14.1,
    }
    const points = getPublicJourneyMapPoints([moment], [photo])

    expect(
      resolvePublicMapFocusPointId(moment.entry.id, photo.id, points),
    ).toBe(`photo:${photo.id}`)
  })
})

function createMoment(overrides: Partial<JourneyMoment> = {}): JourneyMoment {
  const stop = createStop({ status: 'visited', title: 'Morning view' })

  return {
    entry: {
      body: '',
      eventAt: '2026-01-01T08:00:00.000Z',
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

function createChecklistItem(
  overrides: Partial<JourneyChecklistItem> = {},
): JourneyChecklistItem {
  return {
    category: 'wildlife',
    checkedAt: null,
    entryId: null,
    id: crypto.randomUUID(),
    itemSlug: 'peregrine',
    notes: 'Look up at the cliffs',
    position: 0,
    stopId: null,
    templateSlug: 'ceske-svycarsko',
    title: 'Peregrine falcon',
    ...overrides,
  }
}
