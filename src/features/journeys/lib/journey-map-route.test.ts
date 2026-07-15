import { describe, expect, it } from 'vitest'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  getMomentMapCoordinate,
  getPublicMapBoundsCoordinates,
  isValidMapCoordinate,
  resolveApproximateRouteCoordinates,
  resolveJourneyMapRoute,
} from '@/features/journeys/lib/journey-map-route'

describe('journey-map-route', () => {
  it('orders approximate route points chronologically', () => {
    const early = createMoment({
      entry: {
        body: '',
        eventAt: '2026-01-01T08:00:00.000Z',
        id: 'early',
        slug: null,
        stageId: null,
        stopId: null,
        title: 'Early',
        type: 'story',
      },
      location: { latitude: 50, longitude: 14 },
      stop: null,
    })
    const late = createMoment({
      entry: {
        body: '',
        eventAt: '2026-01-02T08:00:00.000Z',
        id: 'late',
        slug: null,
        stageId: null,
        stopId: null,
        title: 'Late',
        type: 'story',
      },
      location: { latitude: 51, longitude: 15 },
      stop: null,
    })

    expect(
      resolveApproximateRouteCoordinates([late, early]).map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })),
    ).toEqual([
      { latitude: 50, longitude: 14 },
      { latitude: 51, longitude: 15 },
    ])
  })

  it('prefers a stored route when at least two valid points exist', () => {
    const route = resolveJourneyMapRoute({
      moments: [createMoment()],
      storedRoute: [
        { latitude: 49, longitude: 13 },
        { latitude: 50, longitude: 14 },
      ],
    })

    expect(route.source).toBe('stored')
    expect(route.coordinates).toHaveLength(2)
  })

  it('falls back to approximate route when no stored route exists', () => {
    const route = resolveJourneyMapRoute({
      moments: [
        createMoment({
          location: { latitude: 50, longitude: 14 },
        }),
        createMoment({
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
        }),
      ],
    })

    expect(route.source).toBe('approximate')
    expect(route.coordinates).toHaveLength(2)
  })

  it('returns none when fewer than two geolocated moments exist', () => {
    expect(
      resolveJourneyMapRoute({
        moments: [createMoment()],
      }),
    ).toEqual({
      coordinates: [{ latitude: 50, longitude: 14 }],
      source: 'none',
    })
  })

  it('ignores invalid coordinates safely', () => {
    expect(isValidMapCoordinate(Number.NaN, 14)).toBe(false)
    expect(isValidMapCoordinate(95, 14)).toBe(false)
    expect(
      resolveApproximateRouteCoordinates([
        createMoment({
          location: { latitude: Number.NaN, longitude: 14 },
        }),
      ]),
    ).toEqual([])
  })

  it('uses photo coordinates ahead of moment stop coordinates', () => {
    const moment = createMoment()
    const photo: JourneyPhotoLocation = {
      entryId: moment.entry.id,
      entryTitle: moment.entry.title,
      id: crypto.randomUUID(),
      latitude: 50.5,
      longitude: 14.5,
    }

    expect(getMomentMapCoordinate(moment, [photo])).toEqual({
      latitude: 50.5,
      longitude: 14.5,
    })
  })

  it('includes at most one route coordinate per moment even with multiple photo pins', () => {
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
    const photos: JourneyPhotoLocation[] = [
      {
        entryId: moment.entry.id,
        entryTitle: moment.entry.title,
        id: crypto.randomUUID(),
        latitude: 50.1,
        longitude: 14.1,
      },
      {
        entryId: moment.entry.id,
        entryTitle: moment.entry.title,
        id: crypto.randomUUID(),
        latitude: 50.2,
        longitude: 14.2,
      },
      {
        entryId: laterMoment.entry.id,
        entryTitle: laterMoment.entry.title,
        id: crypto.randomUUID(),
        latitude: 51.1,
        longitude: 15.1,
      },
    ]

    expect(
      resolveApproximateRouteCoordinates([moment, laterMoment], photos),
    ).toEqual([
      { latitude: 50.1, longitude: 14.1 },
      { latitude: 51.1, longitude: 15.1 },
    ])
  })

  it('removes consecutive duplicate coordinates from the generated route', () => {
    const sharedLocation = { latitude: 50, longitude: 14 }
    const first = createMoment({
      entry: {
        body: '',
        eventAt: '2026-01-01T08:00:00.000Z',
        id: crypto.randomUUID(),
        slug: null,
        stageId: null,
        stopId: null,
        title: 'First',
        type: 'story',
      },
      location: sharedLocation,
      stop: null,
    })
    const second = createMoment({
      entry: {
        body: '',
        eventAt: '2026-01-02T08:00:00.000Z',
        id: crypto.randomUUID(),
        slug: null,
        stageId: null,
        stopId: null,
        title: 'Second',
        type: 'story',
      },
      location: sharedLocation,
      stop: null,
    })
    const third = createMoment({
      entry: {
        body: '',
        eventAt: '2026-01-03T08:00:00.000Z',
        id: crypto.randomUUID(),
        slug: null,
        stageId: null,
        stopId: null,
        title: 'Third',
        type: 'story',
      },
      location: { latitude: 51, longitude: 15 },
      stop: null,
    })

    expect(resolveApproximateRouteCoordinates([first, second, third])).toEqual([
      sharedLocation,
      { latitude: 51, longitude: 15 },
    ])
  })

  it('uses route coordinates for public bounds when available', () => {
    const route = resolveJourneyMapRoute({
      moments: [],
      storedRoute: [
        { latitude: 48, longitude: 12 },
        { latitude: 49, longitude: 13 },
      ],
    })

    expect(
      getPublicMapBoundsCoordinates(route, [{ latitude: 50, longitude: 14 }]),
    ).toEqual([
      { latitude: 48, longitude: 12 },
      { latitude: 49, longitude: 13 },
    ])
  })
})

function createMoment(overrides: Partial<JourneyMoment> = {}): JourneyMoment {
  return {
    entry: {
      body: '',
      eventAt: '2026-01-01T08:00:00.000Z',
      id: crypto.randomUUID(),
      slug: null,
      stageId: null,
      stopId: null,
      title: 'Morning view',
      type: 'story',
    },
    location: { latitude: 50, longitude: 14 },
    stop: null,
    ...overrides,
  }
}
